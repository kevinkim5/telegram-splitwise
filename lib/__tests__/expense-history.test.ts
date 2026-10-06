import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { createdSummary, diffExpense, type ExpenseSnapshot } from '@/lib/expense-history'
import { PUT } from '../../app/api/groups/[chatId]/expenses/[id]/route'

const base = (over: Partial<ExpenseSnapshot> = {}): ExpenseSnapshot => ({
  description: 'Lunch', total_amount: 50, currency: 'SGD', paid_by_member_id: 1, paid_by_name: 'Kev',
  split_type: 'equal', date: '2026-10-03', category: '🍜 Food',
  splits: [
    { member_id: 1, member_name: 'Kev', amount: 25 },
    { member_id: 2, member_name: 'Ann', amount: 25 },
  ],
  ...over,
})

describe('diffExpense', () => {
  it('reports nothing when nothing changed', () => {
    expect(diffExpense(base(), base())).toEqual([])
  })

  it('ignores date timestamps and numeric strings that are equal', () => {
    expect(diffExpense(base({ date: '2026-10-03T00:00:00.000Z' }), base({ total_amount: Number('50.00') }))).toEqual([])
  })

  it('reports description, amount, payer, date and category with old and new values', () => {
    const after = base({
      description: 'Lunch at DTF', total_amount: 58.4, paid_by_member_id: 2, paid_by_name: 'Ann',
      date: '2026-10-04', category: null,
    })
    expect(diffExpense(base(), after)).toEqual([
      { field: 'description', from: 'Lunch', to: 'Lunch at DTF' },
      { field: 'amount', from: 'SGD 50.00', to: 'SGD 58.40' },
      { field: 'paid_by', from: 'Kev', to: 'Ann' },
      { field: 'date', from: '2026-10-03', to: '2026-10-04' },
      { field: 'category', from: '🍜 Food', to: null },
    ])
  })

  it('treats a currency-only change as an amount change', () => {
    expect(diffExpense(base(), base({ currency: 'USD' }))).toEqual([
      { field: 'amount', from: 'SGD 50.00', to: 'USD 50.00' },
    ])
  })

  it('does not call an equal split a change when only the total moved', () => {
    const after = base({
      total_amount: 60,
      splits: [{ member_id: 1, member_name: 'Kev', amount: 30 }, { member_id: 2, member_name: 'Ann', amount: 30 }],
    })
    expect(diffExpense(base(), after).map(c => c.field)).toEqual(['amount'])
  })

  it('reports a split change when people are added, with a summary of the new split', () => {
    const after = base({
      splits: [
        { member_id: 1, member_name: 'Kev', amount: 16.67 },
        { member_id: 2, member_name: 'Ann', amount: 16.67 },
        { member_id: 3, member_name: 'Ben', amount: 16.66 },
      ],
    })
    expect(diffExpense(base(), after)).toEqual([
      { field: 'split', from: 'Ann, Kev (equal)', to: 'Ann, Ben, Kev (equal)' },
    ])
  })

  it('reports custom amount changes and equal -> custom', () => {
    const custom = (a: number, b: number) => base({
      split_type: 'custom',
      splits: [{ member_id: 1, member_name: 'Kev', amount: a }, { member_id: 2, member_name: 'Ann', amount: b }],
    })
    expect(diffExpense(custom(20, 30), custom(20, 30))).toEqual([])
    expect(diffExpense(custom(20, 30), custom(30, 20)).map(c => c.field)).toEqual(['split'])
    expect(diffExpense(base(), custom(25, 25))).toEqual([
      { field: 'split', from: 'Ann, Kev (equal)', to: 'Ann, Kev (custom amounts)' },
    ])
  })
})

describe('createdSummary', () => {
  it('describes amount, payer and split', () => {
    expect(createdSummary(base())).toBe('SGD 50.00 · paid by Kev · split equally between 2')
    expect(createdSummary(base({ split_type: 'custom' }))).toBe('SGD 50.00 · paid by Kev · split between 2 (custom amounts)')
  })
})

// ── PUT /expenses/[id] logs an "edited" event only when something changed ──
const mockSql = vi.mocked(sql)
const props = { params: Promise.resolve({ chatId: '-100123', id: '40' }) }
let events: unknown[][]
let txCalls: number

function routeSql() {
  events = []
  txCalls = 0
  ;(sql as unknown as { transaction: unknown }).transaction = vi.fn(async (qs: unknown[]) => { txCalls = qs.length; return [] })
  mockSql.mockImplementation(((strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim()
    if (/^SELECT id, currency FROM groups/.test(q)) return Promise.resolve([{ id: 5, currency: 'SGD' }])
    if (/^SELECT id FROM members WHERE group_id = \? AND telegram_user_id/.test(q)) return Promise.resolve([{ id: 1 }])
    if (/^SELECT \* FROM expenses WHERE id/.test(q)) return Promise.resolve([{ id: 40, currency: 'SGD', date: '2026-10-03' }])
    if (/^SELECT id FROM members WHERE group_id = \? AND id = ANY/.test(q)) return Promise.resolve([{ id: 1 }, { id: 2 }])
    if (/^SELECT id, first_name, last_name FROM members/.test(q)) {
      return Promise.resolve([{ id: 1, first_name: 'Kev' }, { id: 2, first_name: 'Ann' }])
    }
    if (/^SELECT e\.\*, m\.first_name/.test(q)) {
      return Promise.resolve([{
        id: 40, group_id: 5, description: 'Lunch', total_amount: '50.00', currency: 'SGD',
        paid_by_member_id: 1, split_type: 'equal', date: '2026-10-03', category: '🍜 Food', receipt_key: null,
      }])
    }
    if (/^SELECT es\.id/.test(q)) {
      return Promise.resolve([
        { member_id: 1, amount: '25.00', member_name: 'Kev' },
        { member_id: 2, amount: '25.00', member_name: 'Ann' },
      ])
    }
    if (/^INSERT INTO expense_events/.test(q)) { events.push(vals); return Promise.resolve([]) }
    return Promise.resolve([])
  }) as never)
}

const put = (over: Record<string, unknown> = {}) =>
  PUT(new Request('http://x', {
    method: 'PUT',
    body: JSON.stringify({
      description: 'Lunch', total_amount: 50, currency: 'SGD', paid_by_member_id: 1, split_type: 'equal',
      splits: [{ member_id: 1 }, { member_id: 2 }], date: '2026-10-03', category: '🍜 Food', ...over,
    }),
  }), props)

describe('PUT /expenses/[id] activity log', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAuthUser).mockReturnValue({ id: 99, first_name: 'Kev' } as never)
    routeSql()
  })

  it('writes one edited event with the changes, in the same transaction as the update', async () => {
    const res = await put({ total_amount: 58.4, description: 'Lunch at DTF' })
    expect(res.status).toBe(200)
    expect(events).toHaveLength(1)
    expect(events[0].slice(0, 4)).toEqual([40, 1, 'member', 'edited']) // expense, who, actor, type
    const changes = JSON.parse(events[0][4] as string)
    expect(changes).toEqual([
      { field: 'description', from: 'Lunch', to: 'Lunch at DTF' },
      { field: 'amount', from: 'SGD 50.00', to: 'SGD 58.40' },
    ])
    expect(txCalls).toBe(4) // update, delete splits, insert splits, event
  })

  it('writes no event when the save changed nothing', async () => {
    const res = await put()
    expect(res.status).toBe(200)
    expect(events).toHaveLength(0)
    expect(txCalls).toBe(3)
  })
})
