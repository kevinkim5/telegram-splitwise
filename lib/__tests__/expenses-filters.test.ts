import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { GET } from '../../app/api/groups/[chatId]/expenses/route'

const mockSql = vi.mocked(sql)
const props = { params: Promise.resolve({ chatId: '-100123' }) }
let listCalls: unknown[][]
let summaryCalls: unknown[][]

beforeEach(() => {
  vi.clearAllMocks()
  listCalls = []
  summaryCalls = []
  vi.mocked(getAuthUser).mockReturnValue({ id: 99, first_name: 'Kev' } as never)
  mockSql.mockImplementation(((strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim()
    if (/^SELECT id FROM groups WHERE chat_id/.test(q)) return Promise.resolve([{ id: 5 }])
    if (/^SELECT id FROM members WHERE group_id = \? AND telegram_user_id/.test(q)) return Promise.resolve([{ id: 7 }])
    if (/COUNT\(\*\) OVER\(\)/.test(q)) { listCalls.push([q, ...vals]); return Promise.resolve([{ id: 1, total_count: '1', receipt_key: null }]) }
    if (/GROUP BY e\.currency/.test(q)) { summaryCalls.push([q, ...vals]); return Promise.resolve([{ currency: 'SGD', total: 34, count: 2 }]) }
    return Promise.resolve([])
  }) as never)
})

const get = (qs: string) => GET(new Request('http://x/api/groups/-100123/expenses?' + qs), props)

describe('GET /expenses filters', () => {
  it('without filters it behaves as before: one list query, no summary', async () => {
    const res = await get('page=1')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ total: 1, page: 1, summary: null })
    expect(listCalls).toHaveLength(1)
    expect(summaryCalls).toHaveLength(0)
  })

  it('passes the text as an escaped, bound parameter (never spliced into the SQL)', async () => {
    await get('q=' + encodeURIComponent("50%_off'; DROP TABLE expenses; --"))
    const [sqlText, ...vals] = listCalls[0]!
    expect(String(sqlText)).not.toContain('DROP TABLE')
    expect(vals).toContain("%50\\%\\_off'; DROP TABLE expenses; --%")
    expect(String(sqlText)).toMatch(/ILIKE \? ESCAPE '\\'/)
  })

  it('applies description, category and payer to the search, and the date range to e.date', async () => {
    await get('q=taxi&from=2026-10-01&to=2026-10-31')
    const [sqlText, ...vals] = listCalls[0]!
    expect(String(sqlText)).toMatch(/e\.description ILIKE/)
    expect(String(sqlText)).toMatch(/e\.category ILIKE/)
    expect(String(sqlText)).toMatch(/m\.first_name .* ILIKE/)
    expect(String(sqlText)).toMatch(/e\.date >= \?::date/)
    expect(String(sqlText)).toMatch(/e\.date <= \?::date/)
    expect(vals).toEqual(expect.arrayContaining(['2026-10-01', '2026-10-31', '%taxi%']))
  })

  it('returns the per-currency summary of the filtered set, using the same filters', async () => {
    const res = await get('q=taxi&from=2026-10-01')
    const body = await res.json()
    expect(body.summary).toEqual([{ currency: 'SGD', total: 34, count: 2 }])
    expect(summaryCalls).toHaveLength(1)
    expect(summaryCalls[0]).toEqual(expect.arrayContaining(['%taxi%', '2026-10-01']))
  })

  it('a date-only filter also gets a summary (and no text pattern)', async () => {
    await get('from=2026-10-03&to=2026-10-03')
    expect(summaryCalls).toHaveLength(1)
    expect(listCalls[0]).toContain(null) // no text pattern
  })

  it('swaps a reversed range instead of failing', async () => {
    await get('from=2026-10-09&to=2026-10-01')
    expect(listCalls[0]!.slice(1)).toEqual(expect.arrayContaining(['2026-10-01', '2026-10-09']))
    const vals = listCalls[0]!.slice(1) as unknown[]
    expect(vals.indexOf('2026-10-01')).toBeLessThan(vals.indexOf('2026-10-09'))
  })

  it('rejects an invalid date with 422 and runs no list query', async () => {
    const res = await get('from=2026-02-30')
    expect(res.status).toBe(422)
    expect((await res.json()).error).toMatch(/Invalid date/)
    expect(listCalls).toHaveLength(0)
  })

  it('caps a very long search', async () => {
    await get('q=' + 'x'.repeat(500))
    const pattern = (listCalls[0]!.slice(1) as unknown[]).find(v => typeof v === 'string' && String(v).startsWith('%x')) as string
    expect(pattern.length).toBe(102) // 100 characters plus the two % wildcards
  })
})
