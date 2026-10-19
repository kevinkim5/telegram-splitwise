/**
 * Route-level integration tests for param and body input validation.
 * Covers the two medium-severity fixes:
 *   1. BigInt/parseInt throws on crafted non-numeric URL params → 400 (not 500)
 *   2. Invalid amounts reach the API → 422 before any DB call
 *
 * "Factoring in what the frontend actually sends" means the happy-path tests
 * mirror the exact payload shapes from ExpenseFormPage.tsx and BalancesPage.tsx.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/validate-group-members', () => ({ validateGroupMembers: vi.fn() }))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { validateGroupMembers } from '@/lib/validate-group-members'

import { GET as expensesGET, POST as expensesPOST } from '../../app/api/groups/[chatId]/expenses/route'
import { GET as expenseGET, DELETE as expenseDELETE } from '../../app/api/groups/[chatId]/expenses/[id]/route'
import { POST as settlementsPOST } from '../../app/api/groups/[chatId]/settlements/route'
import { PUT as settingsPUT } from '../../app/api/groups/[chatId]/settings/route'

const mockSql = vi.mocked(sql)
const mockGetAuthUser = vi.mocked(getAuthUser)
const mockValidateGroupMembers = vi.mocked(validateGroupMembers)

const authedUser = { id: 99, first_name: 'Alice' }

function jsonRequest(body: object, method = 'POST'): Request {
  return new Request('http://localhost/', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}
function getRequest(): Request {
  return new Request('http://localhost/')
}

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuthUser.mockReturnValue(authedUser)
})

// ─── 1. BigInt(chatId) — non-numeric chatId returns 400, not 500 ─────────────

describe('invalid chatId returns 400 instead of throwing', () => {
  it('GET /expenses — non-numeric chatId', async () => {
    const res = await expensesGET(getRequest(), {
      params: Promise.resolve({ chatId: 'notanumber' }),
    })
    expect(res.status).toBe(400)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('POST /expenses — non-numeric chatId', async () => {
    const res = await expensesPOST(
      jsonRequest({ description: 'D', total_amount: 10, paid_by_member_id: 1, split_type: 'equal', splits: [{ member_id: 1 }] }),
      { params: Promise.resolve({ chatId: '../admin' }) },
    )
    expect(res.status).toBe(400)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('GET /expenses/:id — non-numeric chatId', async () => {
    const res = await expenseGET(getRequest(), {
      params: Promise.resolve({ chatId: 'abc', id: '55' }),
    })
    expect(res.status).toBe(400)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('accepts a negative group chatId (Telegram groups)', async () => {
    // Should pass chatId check and proceed to DB (group not found → 404)
    mockSql.mockResolvedValueOnce([]) // group not found
    const res = await expensesGET(getRequest(), {
      params: Promise.resolve({ chatId: '-1001234567890' }),
    })
    expect(res.status).toBe(404) // passed chatId check, hit DB
  })
})

// ─── 2. parseInt(id) — non-numeric resource id returns 400, not 500 ──────────

describe('invalid resource id returns 400 instead of throwing', () => {
  it('GET /expenses/:id — non-numeric id', async () => {
    const res = await expenseGET(getRequest(), {
      params: Promise.resolve({ chatId: '123', id: 'notanumber' }),
    })
    expect(res.status).toBe(400)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('DELETE /expenses/:id — non-numeric id', async () => {
    const res = await expenseDELETE(getRequest(), {
      params: Promise.resolve({ chatId: '123', id: '../../../etc' }),
    })
    expect(res.status).toBe(400)
    expect(mockSql).not.toHaveBeenCalled()
  })
})

// ─── 3. Amount validation via Zod — rejects before any DB call ───────────────

describe('POST /expenses — Zod rejects bad amounts before hitting the DB', () => {
  const baseBody = {
    description: 'Dinner',
    paid_by_member_id: 1,
    split_type: 'equal',
    splits: [{ member_id: 1 }, { member_id: 2 }],
  }
  const params = Promise.resolve({ chatId: '123' })

  it('rejects negative total_amount (user types -10 in input)', async () => {
    const res = await expensesPOST(
      jsonRequest({ ...baseBody, total_amount: -10 }),
      { params },
    )
    expect(res.status).toBe(422)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('rejects zero total_amount', async () => {
    const res = await expensesPOST(
      jsonRequest({ ...baseBody, total_amount: 0 }),
      { params },
    )
    expect(res.status).toBe(422)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('rejects missing description', async () => {
    const res = await expensesPOST(
      jsonRequest({ ...baseBody, total_amount: 30, description: '' }),
      { params },
    )
    expect(res.status).toBe(422)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('rejects empty splits array', async () => {
    const res = await expensesPOST(
      jsonRequest({ ...baseBody, total_amount: 30, splits: [] }),
      { params },
    )
    expect(res.status).toBe(422)
    expect(mockSql).not.toHaveBeenCalled()
  })
})

describe('POST /settlements — Zod rejects bad amounts before hitting the DB', () => {
  const params = Promise.resolve({ chatId: '123' })
  const baseBody = { from_member_id: 1, to_member_id: 2 }

  it('rejects negative amount', async () => {
    const res = await settlementsPOST(
      jsonRequest({ ...baseBody, amount: -5 }),
      { params },
    )
    expect(res.status).toBe(422)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('rejects zero amount', async () => {
    const res = await settlementsPOST(
      jsonRequest({ ...baseBody, amount: 0 }),
      { params },
    )
    expect(res.status).toBe(422)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('rejects missing amount', async () => {
    const res = await settlementsPOST(
      jsonRequest(baseBody),
      { params },
    )
    expect(res.status).toBe(422)
    expect(mockSql).not.toHaveBeenCalled()
  })
})

// ─── 4. Regression — valid frontend payloads still work ──────────────────────

describe('POST /expenses — valid frontend payload (regression)', () => {
  const params = Promise.resolve({ chatId: '123' })
  // Exact shape sent by ExpenseFormPage.tsx
  const frontendPayload = {
    description: 'Team dinner',
    total_amount: 90,
    currency: 'SGD',
    paid_by_member_id: 1,
    split_type: 'equal' as const,
    splits: [{ member_id: 1 }, { member_id: 2 }, { member_id: 3 }],
    date: '2024-06-01',
    category: 'Food',
  }

  it('accepts the payload and creates the expense', async () => {
    mockValidateGroupMembers.mockResolvedValueOnce(true)
    mockSql
      .mockResolvedValueOnce([{ id: 7, currency: 'SGD', member_id: 5 }])  // group + membership lookup
      .mockResolvedValueOnce([{ id: 55 }])                   // INSERT CTE
      .mockResolvedValueOnce([{ id: 55, description: 'Team dinner', group_id: 7 }]) // getExpenseWithSplits
      .mockResolvedValueOnce([])                             // splits

    const res = await expensesPOST(jsonRequest(frontendPayload), { params })
    expect(res.status).toBe(201)
  })

  it('accepts a decimal amount (e.g. SGD 12.50)', async () => {
    mockValidateGroupMembers.mockResolvedValueOnce(true)
    mockSql
      .mockResolvedValueOnce([{ id: 7, currency: 'SGD', member_id: 5 }])
      .mockResolvedValueOnce([{ id: 56 }])
      .mockResolvedValueOnce([{ id: 56, description: 'Coffee', group_id: 7 }])
      .mockResolvedValueOnce([])

    const res = await expensesPOST(
      jsonRequest({ ...frontendPayload, description: 'Coffee', total_amount: 12.50 }),
      { params },
    )
    expect(res.status).toBe(201)
  })
})

describe('POST /settlements — valid frontend payload (regression)', () => {
  const params = Promise.resolve({ chatId: '123' })
  // Exact shape sent by BalancesPage.tsx
  const frontendPayload = {
    from_member_id: 1,
    to_member_id: 2,
    amount: 45.00,
    currency: 'SGD',
  }

  it('accepts the payload and creates the settlement', async () => {
    mockValidateGroupMembers.mockResolvedValueOnce(true)
    mockSql
      .mockResolvedValueOnce([{ id: 7, currency: 'SGD', member_id: 5 }])  // group + membership lookup
      .mockResolvedValueOnce([{ id: 88 }])                   // INSERT
      .mockResolvedValueOnce([{ id: 88, from_name: 'Alice', to_name: 'Bob', amount: 45 }])

    const res = await settlementsPOST(jsonRequest(frontendPayload), { params })
    expect(res.status).toBe(201)
  })
})

// ─── 5. Settings PUT — Zod validates currency format ─────────────────────────

describe('PUT /settings — Zod rejects invalid currency before hitting the DB', () => {
  const params = Promise.resolve({ chatId: '123' })

  beforeEach(() => {
    mockSql.mockResolvedValueOnce([{ id: 7, member_id: 5 }]) // group + membership lookup
  })

  it('rejects lowercase currency code (sgd)', async () => {
    const res = await settingsPUT(
      jsonRequest({ currency: 'sgd' }, 'PUT'),
      { params },
    )
    expect(res.status).toBe(422)
    // No UPDATE should have been issued
    expect(mockSql).toHaveBeenCalledTimes(1) // only the group lookup
  })

  it('rejects 4-letter currency code (SGDD)', async () => {
    const res = await settingsPUT(
      jsonRequest({ currency: 'SGDD' }, 'PUT'),
      { params },
    )
    expect(res.status).toBe(422)
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('rejects missing currency field', async () => {
    const res = await settingsPUT(
      jsonRequest({}, 'PUT'),
      { params },
    )
    expect(res.status).toBe(422)
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('rejects currency with special characters (SG$)', async () => {
    const res = await settingsPUT(
      jsonRequest({ currency: 'SG$' }, 'PUT'),
      { params },
    )
    expect(res.status).toBe(422)
    expect(mockSql).toHaveBeenCalledTimes(1)
  })
})

describe('PUT /settings — valid frontend payload (regression)', () => {
  const params = Promise.resolve({ chatId: '123' })

  it('accepts a valid 3-letter uppercase currency (SGD) and returns updated settings', async () => {
    mockSql
      .mockResolvedValueOnce([{ id: 7, member_id: 5 }])            // group + membership lookup
      .mockResolvedValueOnce([])                                     // UPDATE
      .mockResolvedValueOnce([{ id: 7, title: 'Trip', currency: 'SGD' }]) // SELECT after update
      .mockResolvedValueOnce([{ reminder_day: null, set_by: null }])       // weekly reminder setting

    const res = await settingsPUT(
      jsonRequest({ currency: 'SGD' }, 'PUT'),
      { params },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.currency).toBe('SGD')
  })

  it('accepts USD as a valid currency', async () => {
    mockSql
      .mockResolvedValueOnce([{ id: 7, member_id: 5 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 7, title: 'Trip', currency: 'USD' }])
      .mockResolvedValueOnce([{ reminder_day: null, set_by: null }])

    const res = await settingsPUT(
      jsonRequest({ currency: 'USD' }, 'PUT'),
      { params },
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.currency).toBe('USD')
  })
})
