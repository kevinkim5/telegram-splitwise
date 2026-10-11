import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/sql', () => {
  const sql: any = vi.fn()
  // the two totals queries run as one transaction: the tagged-template calls above supply the rows in order
  sql.transaction = vi.fn((queries: unknown[]) => Promise.all(queries))
  return { sql }
})
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { GET as totalsGET } from '../../app/api/groups/[chatId]/totals/route'

const mockSql = vi.mocked(sql)
const mockGetAuthUser = vi.mocked(getAuthUser)

const authedUser = { id: 1, first_name: 'Alice' }

function getRequest() {
  return new Request('http://localhost/')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuthUser.mockReturnValue(authedUser)
})

// ─── Authorization ────────────────────────────────────────────────────────────

describe('GET /totals — authorization', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetAuthUser.mockReturnValue(null)
    const res = await totalsGET(getRequest(), { params: Promise.resolve({ chatId: '-100123' }) })
    expect(res.status).toBe(401)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns 400 for non-numeric chatId', async () => {
    const res = await totalsGET(getRequest(), { params: Promise.resolve({ chatId: 'bad' }) })
    expect(res.status).toBe(400)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('returns 404 when group does not exist', async () => {
    mockSql.mockResolvedValueOnce([]) // no group row
    const res = await totalsGET(getRequest(), { params: Promise.resolve({ chatId: '-100123' }) })
    expect(res.status).toBe(404)
  })

  it('returns 403 when caller is not a group member', async () => {
    mockSql.mockResolvedValueOnce([{ id: 7, title: 'T', currency: 'SGD', member_id: null }]) // group + membership
    const res = await totalsGET(getRequest(), { params: Promise.resolve({ chatId: '-100123' }) })
    expect(res.status).toBe(403)
  })
})

// ─── Response shape ───────────────────────────────────────────────────────────

describe('GET /totals — response shape', () => {
  const params = Promise.resolve({ chatId: '-100123' })

  beforeEach(() => {
    mockSql.mockResolvedValueOnce([{ id: 7, title: 'T', currency: 'SGD', member_id: 5 }]) // group + membership
  })

  it('returns 200 with empty arrays when there are no expenses', async () => {
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const res = await totalsGET(getRequest(), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.group_currency).toBe('SGD')
    expect(body.summary).toEqual([])
    expect(body.by_category).toEqual([])
  })

  it('returns correct totals for a single-currency group', async () => {
    mockSql
      .mockResolvedValueOnce([{ currency: 'SGD', group_total: 150.0, my_total: 50.0, count: 3 }])
      .mockResolvedValueOnce([
        { currency: 'SGD', category: '🍜 Food', group_total: 100.0, my_total: 33.33, count: 2 },
        { currency: 'SGD', category: '🚌 Transport', group_total: 50.0, my_total: 16.67, count: 1 },
      ])

    const res = await totalsGET(getRequest(), { params })
    expect(res.status).toBe(200)
    const body = await res.json()

    expect(body.group_currency).toBe('SGD')
    expect(body.summary).toHaveLength(1)
    expect(body.summary[0]).toMatchObject({ currency: 'SGD', group_total: 150.0, my_total: 50.0, count: 3 })
    expect(body.by_category).toHaveLength(2)
    expect(body.by_category[0]).toMatchObject({ currency: 'SGD', category: '🍜 Food', group_total: 100.0 })
    expect(body.by_category[1]).toMatchObject({ currency: 'SGD', category: '🚌 Transport', group_total: 50.0 })
  })

  it('passes through multi-currency summary in order returned by SQL', async () => {
    mockSql
      .mockResolvedValueOnce([
        { currency: 'SGD', group_total: 500.0, my_total: 125.0, count: 10 },
        { currency: 'USD', group_total: 200.0, my_total: 66.67, count: 4 },
      ])
      .mockResolvedValueOnce([])

    const res = await totalsGET(getRequest(), { params })
    const body = await res.json()
    expect(body.summary).toHaveLength(2)
    expect(body.summary[0].currency).toBe('SGD')
    expect(body.summary[1].currency).toBe('USD')
  })

  it('handles null category (uncategorised expenses)', async () => {
    mockSql
      .mockResolvedValueOnce([{ currency: 'SGD', group_total: 80.0, my_total: 20.0, count: 2 }])
      .mockResolvedValueOnce([
        { currency: 'SGD', category: null, group_total: 80.0, my_total: 20.0, count: 2 },
      ])

    const res = await totalsGET(getRequest(), { params })
    const body = await res.json()
    expect(body.by_category).toHaveLength(1)
    expect(body.by_category[0].category).toBeNull()
    expect(body.by_category[0].group_total).toBe(80.0)
  })

  it('includes group_currency from the groups table regardless of expense currencies', async () => {
    mockSql.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const res = await totalsGET(getRequest(), { params })
    expect((await res.json()).group_currency).toBe('SGD')
  })
})

// ─── Calculation correctness ──────────────────────────────────────────────────

describe('GET /totals — calculation correctness', () => {
  it('my_total reflects 1/3 share when split equally among 3 members', async () => {
    // group_total 180 split equally → my share = 60
    mockSql.mockResolvedValueOnce([{ id: 8, title: 'T', currency: 'SGD', member_id: 3 }]) // group + membership
    mockSql
      .mockResolvedValueOnce([{ currency: 'SGD', group_total: 180.0, my_total: 60.0, count: 3 }])
      .mockResolvedValueOnce([{ currency: 'SGD', category: '🍜 Food', group_total: 180.0, my_total: 60.0, count: 3 }])

    const res = await totalsGET(getRequest(), { params: Promise.resolve({ chatId: '-100456' }) })
    const body = await res.json()
    expect(body.summary[0].my_total / body.summary[0].group_total).toBeCloseTo(1 / 3, 5)
  })

  it('my_total is 0 when member has no expense_splits (not involved in any expense)', async () => {
    mockSql.mockResolvedValueOnce([{ id: 9, title: 'T', currency: 'USD', member_id: 4 }]) // group + membership
    mockSql
      .mockResolvedValueOnce([{ currency: 'USD', group_total: 300.0, my_total: 0.0, count: 5 }])
      .mockResolvedValueOnce([])

    const res = await totalsGET(getRequest(), { params: Promise.resolve({ chatId: '-100789' }) })
    const body = await res.json()
    expect(body.summary[0].my_total).toBe(0.0)
    expect(body.summary[0].group_total).toBe(300.0)
  })

  it('category group_totals sum to overall group_total', async () => {
    mockSql.mockResolvedValueOnce([{ id: 10, title: 'T', currency: 'SGD', member_id: 5 }]) // group + membership
    mockSql
      .mockResolvedValueOnce([{ currency: 'SGD', group_total: 200.0, my_total: 50.0, count: 4 }])
      .mockResolvedValueOnce([
        { currency: 'SGD', category: '🍜 Food',     group_total: 100.0, my_total: 25.0, count: 2 },
        { currency: 'SGD', category: '🚌 Transport', group_total: 60.0,  my_total: 15.0, count: 1 },
        { currency: 'SGD', category: '🏨 Stay',      group_total: 40.0,  my_total: 10.0, count: 1 },
      ])

    const res = await totalsGET(getRequest(), { params: Promise.resolve({ chatId: '-100999' }) })
    const body = await res.json()

    const catGroupSum = body.by_category.reduce((a: number, c: { group_total: number }) => a + c.group_total, 0)
    const catMySum    = body.by_category.reduce((a: number, c: { my_total: number }) => a + c.my_total, 0)

    expect(catGroupSum).toBeCloseTo(body.summary[0].group_total, 5)
    expect(catMySum).toBeCloseTo(body.summary[0].my_total, 5)
  })

  it('my_total across all categories sums to overall my_total', async () => {
    mockSql.mockResolvedValueOnce([{ id: 11, title: 'T', currency: 'JPY', member_id: 6 }]) // group + membership
    mockSql
      .mockResolvedValueOnce([{ currency: 'JPY', group_total: 12000.0, my_total: 4000.0, count: 6 }])
      .mockResolvedValueOnce([
        { currency: 'JPY', category: '🍜 Food',       group_total: 6000.0, my_total: 2000.0, count: 3 },
        { currency: 'JPY', category: '🚌 Transport',  group_total: 3600.0, my_total: 1200.0, count: 2 },
        { currency: 'JPY', category: '🎡 Activities', group_total: 2400.0, my_total: 800.0,  count: 1 },
      ])

    const res = await totalsGET(getRequest(), { params: Promise.resolve({ chatId: '-100111' }) })
    const body = await res.json()

    const catMySum = body.by_category.reduce((a: number, c: { my_total: number }) => a + c.my_total, 0)
    expect(catMySum).toBeCloseTo(body.summary[0].my_total, 5)
  })
})
