import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sql', () => {
  const sql: any = vi.fn()
  // the removal runs as one transaction: the tagged-template calls supply the results in order
  sql.transaction = vi.fn((queries: unknown[]) => Promise.all(queries))
  return { sql }
})
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/db', () => ({ ensureSchema: vi.fn() }))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '../group-member'
import { validateGroupMembers } from '../validate-group-members'
import { balanceLinesFor, removalConfirmText } from '../member-removal'
import { DELETE as removeDELETE } from '../../app/api/groups/[chatId]/members/[memberId]/route'
import { POST as restorePOST } from '../../app/api/groups/[chatId]/members/[memberId]/restore/route'
import { GET as membersGET } from '../../app/api/groups/[chatId]/members/route'
import { POST as initPOST } from '../../app/api/groups/init/route'
import { POST as expensePOST } from '../../app/api/groups/[chatId]/expenses/route'

const mockSql = vi.mocked(sql)
const text = (i: number) => (mockSql.mock.calls[i]![0] as unknown as string[]).join('?').replace(/\s+/g, ' ').trim()
const vals = (i: number) => mockSql.mock.calls[i]!.slice(1)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getAuthUser).mockReturnValue({ id: 99, first_name: 'Kev' } as never)
})

describe('getGroupMember: a removed member is no longer a member', () => {
  it('only matches members who have not been removed', async () => {
    mockSql.mockResolvedValueOnce([] as never)
    expect(await getGroupMember(5, 99)).toBeNull()
    expect(text(0)).toMatch(/WHERE group_id = \? AND telegram_user_id = \? AND removed_at IS NULL$/)
  })
})

describe('getGroupMember right after a deploy that adds removed_at', () => {
  it('if the column does not exist yet it applies the schema and retries once, instead of failing', async () => {
    const { ensureSchema } = await import('@/lib/db')
    mockSql
      .mockRejectedValueOnce(new Error('column "removed_at" does not exist') as never) // the lookup
    // ensureSchema runs its own statements (mocked to resolve with nothing), then the retry finds the member
    mockSql.mockResolvedValue([{ id: 42 }] as never)
    expect(await getGroupMember(5, 99)).toEqual({ id: 42 })
    expect(vi.mocked(ensureSchema)).toHaveBeenCalledTimes(1)
  })
  it('any other database error is not swallowed', async () => {
    mockSql.mockRejectedValueOnce(new Error('connection reset') as never)
    await expect(getGroupMember(5, 99)).rejects.toThrow('connection reset')
  })
})

describe('validateGroupMembers with removed members', () => {
  it('by default only current members are accepted (nobody can be added to a new expense once removed)', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1 }] as never)
    expect(await validateGroupMembers(5, [1, 2])).toBe(false) // 2 is removed, so only 1 is found
    expect(text(0)).toMatch(/AND removed_at IS NULL$/)
  })
  it('allowRemoved: true accepts anyone in the group (recording a payment that clears a removed member\'s balance)', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1 }, { id: 2 }] as never)
    expect(await validateGroupMembers(5, [1, 2], { allowRemoved: true })).toBe(true)
    expect(text(0)).not.toMatch(/removed_at/)
  })
  it('allowRemoved: [ids] accepts only those removed members (an expense they are already on)', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1 }, { id: 2 }] as never)
    expect(await validateGroupMembers(5, [1, 2], { allowRemoved: [2] })).toBe(true)
    expect(text(0)).toMatch(/AND \(removed_at IS NULL OR id = ANY\(\?::int\[\]\)\)/)
    expect(vals(0)[2]).toEqual([2])
  })
  it('an empty allow-list behaves like the default', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1 }] as never)
    await validateGroupMembers(5, [1], { allowRemoved: [] })
    expect(text(0)).toMatch(/AND removed_at IS NULL$/)
  })
  it('a member from another group is still refused', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1 }] as never)
    expect(await validateGroupMembers(5, [1, 99], { allowRemoved: true })).toBe(false)
  })
})

describe('removal wording', () => {
  it('removing someone square: says what happens, nothing about money', () => {
    const t = removalConfirmText('Ann', false, [])
    expect(t).toContain("Remove Ann from this group? Ann won't be able to open it unless someone adds them back.")
    expect(t).not.toMatch(/owe|owed/)
  })
  it('mentions what they owe / are owed and that they stay on Balances until settled', () => {
    const t = removalConfirmText('Ann', false, [{ currency: 'SGD', net: -12.5 }, { currency: 'JPY', net: 3000 }])
    expect(t).toContain('Ann still owes SGD 12.50 and is owed JPY 3000.00. They will stay on the Balances tab, marked removed, until it is settled.')
  })
  it('leaving is worded in the second person', () => {
    const t = removalConfirmText('Kev', true, [{ currency: 'SGD', net: -5 }])
    expect(t).toContain('Leave this group?')
    expect(t).toContain('You still owe SGD 5.00. You will stay on the Balances tab')
  })
  it('balanceLinesFor picks one member\'s non-zero lines and ignores rounding dust', () => {
    const by = {
      SGD: [{ member_id: 7, net_amount: -12.5 }, { member_id: 8, net_amount: 12.5 }],
      JPY: [{ member_id: 7, net_amount: 0.001 }, { member_id: 8, net_amount: 0 }],
    }
    expect(balanceLinesFor(7, by)).toEqual([{ currency: 'SGD', net: -12.5 }])
    expect(balanceLinesFor(9, by)).toEqual([])
    expect(balanceLinesFor(7, undefined)).toEqual([])
  })
})

// ── DELETE /members/[memberId] ──
describe('DELETE /members/[memberId]', () => {
  const props = (memberId = '8') => ({ params: Promise.resolve({ chatId: '-100123', memberId }) })
  const call = (memberId = '8') => removeDELETE(new Request('http://x', { method: 'DELETE' }), props(memberId))
  // sequence: group, caller membership, the group lock, the UPDATE (rows removed), then a lookup when nothing was removed
  const script = (...rows: unknown[][]) => rows.forEach(r => mockSql.mockResolvedValueOnce(r as never))

  it('401 without auth; 400 for a bad chat or member id; nothing queried', async () => {
    vi.mocked(getAuthUser).mockReturnValue(null)
    expect((await call()).status).toBe(401)
    vi.mocked(getAuthUser).mockReturnValue({ id: 99, first_name: 'Kev' } as never)
    for (const bad of ['abc', '0', '-3', '1.5', '8; DROP TABLE members']) expect((await call(bad)).status, bad).toBe(400)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('404 for an unknown group, 403 for someone who is not (or no longer) a member', async () => {
    script([])
    expect((await call()).status).toBe(404)
    script([{ id: 5 }], [])
    expect((await call()).status).toBe(403)
  })

  it('removes a member: one UPDATE that stamps who did it, scoped to this group, never deleting rows', async () => {
    script([{ id: 5 }], [{ id: 7 }], [{ id: 5 }], [{ id: 8 }])
    const res = await call('8')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, left: false })
    // the group row is locked first, in the same transaction, so two simultaneous removals cannot empty the group
    expect(text(2)).toBe('SELECT id FROM groups WHERE id = ? FOR UPDATE')
    expect(vals(2)).toEqual([5])
    expect(mockSql.transaction).toHaveBeenCalledTimes(1)
    expect(text(3)).toMatch(/^UPDATE members SET removed_at = NOW\(\), removed_by = \? WHERE id = \? AND group_id = \? AND removed_at IS NULL AND \(SELECT COUNT\(\*\) FROM members WHERE group_id = \? AND removed_at IS NULL\) > 1 RETURNING id$/)
    expect(vals(3)).toEqual([7, 8, 5, 5]) // removed by member 7, target 8, group 5
    expect(mockSql.mock.calls.some((_, i) => /DELETE FROM/.test(text(i)))).toBe(false)
  })

  it('removing yourself is "leaving"', async () => {
    script([{ id: 5 }], [{ id: 7 }], [{ id: 5 }], [{ id: 7 }])
    expect(await (await call('7')).json()).toEqual({ ok: true, left: true })
  })

  it('refuses to remove the last member, so a group is never empty', async () => {
    script([{ id: 5 }], [{ id: 7 }], [{ id: 5 }], [], [{ removed_at: null }])
    const res = await call('7')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/last member/)
  })

  it('removing someone already removed is a 409, not a second removal', async () => {
    script([{ id: 5 }], [{ id: 7 }], [{ id: 5 }], [], [{ removed_at: '2026-11-20T00:00:00Z' }])
    const res = await call('8')
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/Already removed/)
  })

  it('a member id from another group (or that does not exist) is a 404', async () => {
    script([{ id: 5 }], [{ id: 7 }], [{ id: 5 }], [], [])
    expect((await call('4242')).status).toBe(404)
    expect(vals(4)).toEqual([4242, 5]) // looked up within this group only
  })
})

// ── POST /members/[memberId]/restore ──
describe('POST /members/[memberId]/restore', () => {
  const props = (memberId = '8') => ({ params: Promise.resolve({ chatId: '-100123', memberId }) })
  const call = (memberId = '8') => restorePOST(new Request('http://x', { method: 'POST' }), props(memberId))

  it('adds a removed member back with one UPDATE scoped to this group', async () => {
    mockSql.mockResolvedValueOnce([{ id: 5 }] as never).mockResolvedValueOnce([{ id: 7 }] as never).mockResolvedValueOnce([{ id: 8 }] as never)
    const res = await call('8')
    expect(res.status).toBe(200)
    expect(text(2)).toMatch(/^UPDATE members SET removed_at = NULL, removed_by = NULL WHERE id = \? AND group_id = \? AND removed_at IS NOT NULL RETURNING id$/)
    expect(vals(2)).toEqual([8, 5])
  })
  it('404 when that member is not removed (or not in this group); 403 for a non-member; 400 for a bad id', async () => {
    mockSql.mockResolvedValueOnce([{ id: 5 }] as never).mockResolvedValueOnce([{ id: 7 }] as never).mockResolvedValueOnce([] as never)
    expect((await call('8')).status).toBe(404)
    mockSql.mockReset()
    mockSql.mockResolvedValueOnce([{ id: 5 }] as never).mockResolvedValueOnce([] as never)
    expect((await call('8')).status).toBe(403)
    mockSql.mockReset()
    expect((await call('x')).status).toBe(400)
    expect(mockSql).not.toHaveBeenCalled()
  })
})

// ── GET /members ──
describe('GET /members', () => {
  it('returns everyone with removed_at so the app can tell current from removed', async () => {
    mockSql.mockResolvedValueOnce([{ id: 5, title: 'T', currency: 'SGD', member_id: 7 }] as never)
      .mockResolvedValueOnce([{ id: 7, removed_at: null }, { id: 8, removed_at: '2026-11-20T00:00:00Z' }] as never)
    const res = await membersGET(new Request('http://x'), { params: Promise.resolve({ chatId: '-100123' }) })
    expect(await res.json()).toHaveLength(2)
    expect(text(1)).toMatch(/SELECT id, group_id, telegram_user_id, first_name, last_name, username, photo_url, created_at, removed_at FROM members/)
  })
})

// ── opening the app after being removed ──
describe('POST /groups/init for a removed member', () => {
  const call = () => initPOST(new Request('http://x', { method: 'POST', body: JSON.stringify({ chatId: '-1001234567890', chatTitle: 'Trip' }) }))
  it('is refused with a message and writes nothing (they are still in the Telegram chat, so this must not re-register them)', async () => {
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const q = strings.join('?').replace(/\s+/g, ' ').trim()
      if (/^SELECT id FROM groups WHERE chat_id/.test(q)) return Promise.resolve([{ id: 5 }])
      if (/^SELECT removed_at FROM members/.test(q)) return Promise.resolve([{ removed_at: '2026-11-20T00:00:00Z' }])
      return Promise.resolve([])
    }) as never)
    const res = await call()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/removed from this group/)
    const writes = mockSql.mock.calls.map((_, i) => text(i)).filter(t => /^(INSERT|UPDATE|DELETE)/.test(t))
    expect(writes).toEqual([])
  })
  it('a member who was never removed gets in as before', async () => {
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const q = strings.join('?').replace(/\s+/g, ' ').trim()
      if (/^SELECT id FROM groups WHERE chat_id/.test(q)) return Promise.resolve([{ id: 5 }])
      if (/^SELECT removed_at FROM members/.test(q)) return Promise.resolve([{ removed_at: null }])
      if (/^SELECT id FROM members WHERE group_id/.test(q)) return Promise.resolve([{ id: 7 }])
      if (/^SELECT \* FROM groups/.test(q)) return Promise.resolve([{ id: 5 }])
      if (/^SELECT \* FROM members/.test(q)) return Promise.resolve([{ id: 7 }])
      return Promise.resolve([])
    }) as never)
    expect((await call()).status).toBe(200)
  })
})

// ── a new expense cannot include a removed member, even if the app is bypassed ──
describe('POST /expenses with a removed member', () => {
  const REMOVED = 9
  // A fake database for the membership checks: members 7 and 8 are current, 9 is removed. It honours the
  // removed_at filter in the query the route actually sends, so this fails if the filter is dropped.
  const db = () => mockSql.mockImplementation(((strings: TemplateStringsArray, ...v: unknown[]) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim()
    if (/^SELECT g\.id|^SELECT id, currency FROM groups/.test(q)) return Promise.resolve([{ id: 5, title: 'T', currency: 'SGD', member_id: 7 }])
    if (/^SELECT id FROM members WHERE group_id = \? AND telegram_user_id/.test(q)) return Promise.resolve([{ id: 7 }])
    if (/^SELECT id FROM members WHERE group_id = \? AND id = ANY/.test(q)) {
      const ids = v[1] as number[]
      const activeOnly = /removed_at IS NULL$/.test(q)
      return Promise.resolve([7, 8, REMOVED].filter(id => ids.includes(id) && (!activeOnly || id !== REMOVED)).map(id => ({ id })))
    }
    return Promise.resolve([])
  }) as never)
  const post = (body: object) => expensePOST(
    new Request('http://x', { method: 'POST', body: JSON.stringify({ description: 'Dinner', total_amount: 30, currency: 'SGD', split_type: 'equal', date: '2026-11-20', ...body }) }),
    { params: Promise.resolve({ chatId: '-100123' }) },
  )
  const inserts = () => mockSql.mock.calls.map((_, i) => text(i)).filter(t => /^(WITH|INSERT)/.test(t))

  it('a removed person as the payer is refused with a 422 and nothing is saved', async () => {
    db()
    const res = await post({ paid_by_member_id: REMOVED, splits: [{ member_id: 7 }, { member_id: 8 }] })
    expect(res.status).toBe(422)
    expect(inserts()).toEqual([])
  })
  it('a removed person in the split is refused with a 422 and nothing is saved', async () => {
    db()
    const res = await post({ paid_by_member_id: 7, splits: [{ member_id: 7 }, { member_id: REMOVED }] })
    expect(res.status).toBe(422)
    expect(inserts()).toEqual([])
  })
  it('the same expense with only current members passes the membership check', async () => {
    db()
    // the fake database has no expense rows to return afterwards, so the route may fail after saving;
    // what matters here is that it got as far as saving (it was not stopped by the membership check)
    await post({ paid_by_member_id: 7, splits: [{ member_id: 7 }, { member_id: 8 }] }).catch(() => {})
    expect(inserts().length).toBeGreaterThan(0)
  })
})

// ── a new expense cannot include a removed member, even if the app is bypassed ──
describe('POST /expenses with a removed member', () => {
  const REMOVED = 9
  // A fake database for the membership checks: members 7 and 8 are current, 9 is removed. It honours the
  // removed_at filter in the query the route actually sends, so this fails if the filter is dropped.
  const db = () => mockSql.mockImplementation(((strings: TemplateStringsArray, ...v: unknown[]) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim()
    if (/^SELECT g\.id|^SELECT id, currency FROM groups/.test(q)) return Promise.resolve([{ id: 5, title: 'T', currency: 'SGD', member_id: 7 }])
    if (/^SELECT id FROM members WHERE group_id = \? AND telegram_user_id/.test(q)) return Promise.resolve([{ id: 7 }])
    if (/^SELECT id FROM members WHERE group_id = \? AND id = ANY/.test(q)) {
      const ids = v[1] as number[]
      const activeOnly = /removed_at IS NULL$/.test(q)
      return Promise.resolve([7, 8, REMOVED].filter(id => ids.includes(id) && (!activeOnly || id !== REMOVED)).map(id => ({ id })))
    }
    return Promise.resolve([])
  }) as never)
  const post = (body: object) => expensePOST(
    new Request('http://x', { method: 'POST', body: JSON.stringify({ description: 'Dinner', total_amount: 30, currency: 'SGD', split_type: 'equal', date: '2026-11-20', ...body }) }),
    { params: Promise.resolve({ chatId: '-100123' }) },
  )
  const inserts = () => mockSql.mock.calls.map((_, i) => text(i)).filter(t => /^(WITH|INSERT)/.test(t))

  it('a removed person as the payer is refused with a 422 and nothing is saved', async () => {
    db()
    const res = await post({ paid_by_member_id: REMOVED, splits: [{ member_id: 7 }, { member_id: 8 }] })
    expect(res.status).toBe(422)
    expect(inserts()).toEqual([])
  })
  it('a removed person in the split is refused with a 422 and nothing is saved', async () => {
    db()
    const res = await post({ paid_by_member_id: 7, splits: [{ member_id: 7 }, { member_id: REMOVED }] })
    expect(res.status).toBe(422)
    expect(inserts()).toEqual([])
  })
  it('the same expense with only current members passes the membership check', async () => {
    db()
    // the fake database has no expense rows to return afterwards, so the route may fail after saving;
    // what matters here is that it got as far as saving (it was not stopped by the membership check)
    await post({ paid_by_member_id: 7, splits: [{ member_id: 7 }, { member_id: 8 }] }).catch(() => {})
    expect(inserts().length).toBeGreaterThan(0)
  })
})
