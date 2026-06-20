import { describe, it, expect } from 'vitest'
import { expenseBodySchema, settlementBodySchema, settingsBodySchema } from '../schemas'

// Representative payload matching what ExpenseFormPage.tsx sends
const validExpense = {
  description: 'Dinner',
  total_amount: 30.50,
  currency: 'SGD',
  paid_by_member_id: 1,
  split_type: 'equal' as const,
  splits: [{ member_id: 1 }, { member_id: 2 }],
  date: '2024-01-15',
  category: 'Food',
}

// Representative payload matching what BalancesPage.tsx sends
const validSettlement = {
  from_member_id: 1,
  to_member_id: 2,
  amount: 15.50,
  currency: 'SGD',
}

describe('expenseBodySchema', () => {
  it('accepts a typical frontend payload', () => {
    expect(expenseBodySchema.safeParse(validExpense).success).toBe(true)
  })

  it('accepts payload without optional fields (currency, date, category)', () => {
    const { currency, date, category, ...minimal } = validExpense
    expect(expenseBodySchema.safeParse(minimal).success).toBe(true)
  })

  it('accepts custom split with amounts', () => {
    const custom = {
      ...validExpense,
      split_type: 'custom' as const,
      splits: [
        { member_id: 1, amount: 20 },
        { member_id: 2, amount: 10.50 },
      ],
    }
    expect(expenseBodySchema.safeParse(custom).success).toBe(true)
  })

  it('rejects negative total_amount', () => {
    expect(expenseBodySchema.safeParse({ ...validExpense, total_amount: -10 }).success).toBe(false)
  })

  it('rejects zero total_amount', () => {
    expect(expenseBodySchema.safeParse({ ...validExpense, total_amount: 0 }).success).toBe(false)
  })

  it('rejects non-finite total_amount (Infinity)', () => {
    // JSON cannot represent Infinity, but guard it at schema level
    expect(expenseBodySchema.safeParse({ ...validExpense, total_amount: Infinity }).success).toBe(false)
  })

  it('rejects empty description', () => {
    expect(expenseBodySchema.safeParse({ ...validExpense, description: '' }).success).toBe(false)
  })

  it('rejects description over 500 characters', () => {
    expect(expenseBodySchema.safeParse({ ...validExpense, description: 'x'.repeat(501) }).success).toBe(false)
  })

  it('rejects empty splits array', () => {
    expect(expenseBodySchema.safeParse({ ...validExpense, splits: [] }).success).toBe(false)
  })

  it('rejects invalid split_type', () => {
    expect(expenseBodySchema.safeParse({ ...validExpense, split_type: 'random' }).success).toBe(false)
  })

  it('rejects lowercase currency', () => {
    expect(expenseBodySchema.safeParse({ ...validExpense, currency: 'sgd' }).success).toBe(false)
  })

  it('rejects currency shorter than 3 letters', () => {
    expect(expenseBodySchema.safeParse({ ...validExpense, currency: 'SG' }).success).toBe(false)
  })

  it('rejects currency longer than 3 letters', () => {
    expect(expenseBodySchema.safeParse({ ...validExpense, currency: 'SGDD' }).success).toBe(false)
  })

  it('accepts null category (no category selected)', () => {
    expect(expenseBodySchema.safeParse({ ...validExpense, category: null }).success).toBe(true)
  })
})

describe('settlementBodySchema', () => {
  it('accepts a typical frontend payload', () => {
    expect(settlementBodySchema.safeParse(validSettlement).success).toBe(true)
  })

  it('accepts payload without optional currency', () => {
    const { currency, ...minimal } = validSettlement
    expect(settlementBodySchema.safeParse(minimal).success).toBe(true)
  })

  it('rejects negative amount', () => {
    expect(settlementBodySchema.safeParse({ ...validSettlement, amount: -5 }).success).toBe(false)
  })

  it('rejects zero amount', () => {
    expect(settlementBodySchema.safeParse({ ...validSettlement, amount: 0 }).success).toBe(false)
  })

  it('rejects non-finite amount (Infinity)', () => {
    expect(settlementBodySchema.safeParse({ ...validSettlement, amount: Infinity }).success).toBe(false)
  })

  it('rejects missing from_member_id', () => {
    const { from_member_id, ...rest } = validSettlement
    expect(settlementBodySchema.safeParse(rest).success).toBe(false)
  })

  it('rejects invalid currency format', () => {
    expect(settlementBodySchema.safeParse({ ...validSettlement, currency: 'usd' }).success).toBe(false)
  })
})

describe('settingsBodySchema', () => {
  it('accepts a valid 3-letter uppercase currency', () => {
    expect(settingsBodySchema.safeParse({ currency: 'SGD' }).success).toBe(true)
  })

  it('rejects lowercase', () => {
    expect(settingsBodySchema.safeParse({ currency: 'sgd' }).success).toBe(false)
  })

  it('rejects missing currency', () => {
    expect(settingsBodySchema.safeParse({}).success).toBe(false)
  })
})
