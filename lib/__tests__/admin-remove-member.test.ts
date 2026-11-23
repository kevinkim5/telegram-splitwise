import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => { ;(globalThis as any).React = require('react') })

vi.mock('@/lib/sql', () => {
  const sql: any = vi.fn()
  sql.transaction = vi.fn((queries: unknown[]) => Promise.all(queries))
  return { sql }
})
const authMock = vi.fn()
vi.mock('@/auth', () => ({ auth: (...a: unknown[]) => authMock(...a), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ ensureSchema: vi.fn() }))
vi.mock('next/link', () => ({ default: (p: any) => require('react').createElement('a', { href: p.href }, p.children) }))

import { renderToStaticMarkup } from 'react-dom/server'
import { sql } from '@/lib/sql'
import { removeMember, restoreMember } from '../member-store'
import { adminRemoveMember, adminRestoreMember } from '../admin-members'
import AdminGroupPage from '../../app/admin/[groupId]/page'

const mockSql = vi.mocked(sql)
const text = (i: number) => (mockSql.mock.calls[i]![0] as unknown as string[]).join('?').replace(/\s+/g, ' ').trim()
const vals = (i: number) => mockSql.mock.calls[i]!.slice(1)
beforeEach(() => { vi.clearAllMocks(); authMock.mockResolvedValue({ user: { name: 'admin' } }) })

describe('removeMember / restoreMember (shared by the app and the admin dashboard)', () => {
  it('locks the group row, then removes within that group; an admin removal records no member as the remover', async () => {
    mockSql.mockResolvedValueOnce([{ id: 5 }] as never).mockResolvedValueOnce([{ id: 8 }] as never)
    expect(await removeMember(5, 8, null)).toBe('removed')
    expect(text(0)).toBe('SELECT id FROM groups WHERE id = ? FOR UPDATE')
    expect(text(1)).toMatch(/^UPDATE members SET removed_at = NOW\(\), removed_by = \? WHERE id = \? AND group_id = \? AND removed_at IS NULL AND \(SELECT COUNT\(\*\) FROM members WHERE group_id = \? AND removed_at IS NULL\) > 1 RETURNING id$/)
    expect(vals(1)).toEqual([null, 8, 5, 5])
  })
  it('says why nothing was removed: not found / already removed / last member', async () => {
    const none = () => mockSql.mockResolvedValueOnce([{ id: 5 }] as never).mockResolvedValueOnce([] as never)
    none(); mockSql.mockResolvedValueOnce([] as never)
    expect(await removeMember(5, 99, null)).toBe('not_found')
    none(); mockSql.mockResolvedValueOnce([{ removed_at: '2026-11-01' }] as never)
    expect(await removeMember(5, 8, null)).toBe('already_removed')
    none(); mockSql.mockResolvedValueOnce([{ removed_at: null }] as never)
    expect(await removeMember(5, 7, null)).toBe('last_member')
  })
  it('restore: true when a removed member was added back, false otherwise; scoped to the group', async () => {
    mockSql.mockResolvedValueOnce([{ id: 8 }] as never)
    expect(await restoreMember(5, 8)).toBe(true)
    expect(text(0)).toMatch(/^UPDATE members SET removed_at = NULL, removed_by = NULL WHERE id = \? AND group_id = \? AND removed_at IS NOT NULL RETURNING id$/)
    expect(vals(0)).toEqual([8, 5])
    mockSql.mockResolvedValueOnce([] as never)
    expect(await restoreMember(5, 8)).toBe(false)
  })
  it('admin wrappers turn the outcome into the message the dashboard shows', async () => {
    mockSql.mockResolvedValueOnce([{ id: 5 }] as never).mockResolvedValueOnce([{ id: 8 }] as never)
    expect(await adminRemoveMember(5, 8)).toEqual({})
    mockSql.mockResolvedValueOnce([{ id: 5 }] as never).mockResolvedValueOnce([] as never).mockResolvedValueOnce([{ removed_at: null }] as never)
    expect(await adminRemoveMember(5, 7)).toEqual({ error: "You can't remove the last member of a group." })
    mockSql.mockResolvedValueOnce([] as never)
    expect(await adminRestoreMember(5, 8)).toEqual({ error: 'That member is not removed.' })
  })
})

// ── the dashboard page ──
type El = { type: unknown; props: Record<string, unknown> }
function findByName(node: unknown, name: string): El | null {
  if (!node || typeof node !== 'object') return null
  const el = node as El
  if (typeof el.type === 'function' && (el.type as { name?: string }).name === name) return el
  const kids = (el.props as { children?: unknown } | undefined)?.children
  for (const k of Array.isArray(kids) ? kids : [kids]) { const f = findByName(k, name); if (f) return f }
  return null
}

describe('admin group page, Members tab', () => {
  const MEMBERS = [
    { id: 7, first_name: 'Kev', last_name: null, username: 'kev', telegram_user_id: '99', created_at: '2026-01-01T00:00:00Z', removed_at: null },
    { id: 8, first_name: 'Ann', last_name: 'Lee', username: null, telegram_user_id: '100', created_at: '2026-01-02T00:00:00Z', removed_at: null },
    { id: 9, first_name: 'Ben', last_name: null, username: null, telegram_user_id: '101', created_at: '2026-01-03T00:00:00Z', removed_at: '2026-11-20T00:00:00Z' },
  ]
  beforeEach(() => {
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const q = strings.join('?').replace(/\s+/g, ' ').trim()
      if (/FROM groups WHERE id/.test(q)) return Promise.resolve([{ id: 5, title: 'Tokyo' }])
      if (/COUNT\(\*\) FILTER \(WHERE deleted_at IS NULL\)[\s\S]*FROM expenses/.test(q)) return Promise.resolve([{ active: 1, deleted: 0 }])
      if (/FROM settlements WHERE group_id = \? *$/.test(q) || /FILTER \(WHERE deleted_at IS NULL\)::int AS active.*FROM settlements/.test(q)) return Promise.resolve([{ active: 0, deleted: 0 }])
      if (/SELECT currency, SUM\(total_amount\)/.test(q)) return Promise.resolve([])
      if (/COUNT\(\*\)::int AS n FROM members/.test(q)) return Promise.resolve([{ n: 2 }])
      if (/^SELECT \* FROM members/.test(q)) return Promise.resolve(MEMBERS)
      if (/SELECT member_id, currency, SUM\(c\)::bigint AS cents/.test(q)) return Promise.resolve([
        { member_id: 8, currency: 'SGD', cents: '-1250' }, { member_id: 7, currency: 'SGD', cents: '1250' },
        { member_id: 9, currency: 'JPY', cents: '300000' },
      ])
      return Promise.resolve([])
    }) as never)
  })
  const render = async () => AdminGroupPage({ params: Promise.resolve({ groupId: '5' }), searchParams: Promise.resolve({ tab: 'members' }) })

  it('lists current and removed members with Remove / Add back, and what each still owes or is owed', async () => {
    const html = renderToStaticMarkup(await render())
    expect(html).toContain('Kev')
    expect(html).toMatch(/Ann Lee[\s\S]*Remove/)
    expect(html).toContain('Add back')                        // for Ben
    expect(html).toMatch(/removed<\/span>/)
    expect(html).toContain('owes SGD 12.50')                  // Ann
    expect(html).toContain('is owed SGD 12.50')               // Kev
    expect(html).toContain('is owed JPY 3000.00')             // Ben, removed but not square
    expect(html).toContain('Telegram ID 100')
  })

  it('the Remove / Add back buttons are server actions that need an admin session', async () => {
    const list = findByName(await render(), 'MembersList')!
    const remove = list.props.remove as (id: number) => Promise<unknown>
    const restore = list.props.restore as (id: number) => Promise<unknown>
    authMock.mockResolvedValue(null)
    mockSql.mockClear()
    await expect(remove(8)).rejects.toThrow('Unauthorized')
    await expect(restore(9)).rejects.toThrow('Unauthorized')
    expect(mockSql).not.toHaveBeenCalled() // nothing touched without a session
  })

  it('signed in: Remove targets that member in THIS group with no member as remover; Add back restores in this group', async () => {
    const list = findByName(await render(), 'MembersList')!
    mockSql.mockClear()
    mockSql.mockResolvedValueOnce([{ id: 5 }] as never).mockResolvedValueOnce([{ id: 8 }] as never)
    expect(await (list.props.remove as (id: number) => Promise<unknown>)(8)).toEqual({})
    expect(vals(1)).toEqual([null, 8, 5, 5])
    mockSql.mockClear()
    mockSql.mockResolvedValueOnce([{ id: 9 }] as never)
    expect(await (list.props.restore as (id: number) => Promise<unknown>)(9)).toEqual({})
    expect(vals(0)).toEqual([9, 5])
  })

  it('other tabs do not load the balance query', async () => {
    mockSql.mockClear()
    await AdminGroupPage({ params: Promise.resolve({ groupId: '5' }), searchParams: Promise.resolve({ tab: 'settlements' }) })
    expect(mockSql.mock.calls.some((_, i) => /SUM\(c\)::bigint/.test(text(i)))).toBe(false)
  })
})
