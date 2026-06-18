import { describe, it, expect } from 'vitest'
import { computeEqualSplits } from '../splits'

describe('computeEqualSplits', () => {
  it('splits evenly when divisible', () => {
    const result = computeEqualSplits(10, [1, 2])
    expect(result).toEqual([
      { member_id: 1, amount: 5 },
      { member_id: 2, amount: 5 },
    ])
  })

  it('single person receives full amount', () => {
    expect(computeEqualSplits(42.50, [7])).toEqual([{ member_id: 7, amount: 42.50 }])
  })

  it('returns empty array for no members', () => {
    expect(computeEqualSplits(100, [])).toEqual([])
  })

  it('$10 / 3: last person gets rounding remainder', () => {
    const result = computeEqualSplits(10, [1, 2, 3])
    expect(result[0].amount).toBe(3.33)
    expect(result[1].amount).toBe(3.33)
    expect(result[2].amount).toBe(3.34)
  })

  it('$1 / 3: rounding is correct at small amounts', () => {
    const result = computeEqualSplits(1, [1, 2, 3])
    expect(result[0].amount).toBe(0.33)
    expect(result[1].amount).toBe(0.33)
    expect(result[2].amount).toBe(0.34)
  })

  it('$100 / 3: remainder goes to last', () => {
    const result = computeEqualSplits(100, [1, 2, 3])
    expect(result[0].amount).toBe(33.33)
    expect(result[1].amount).toBe(33.33)
    expect(result[2].amount).toBe(33.34)
  })

  it('splits always sum exactly to total (no floating point leak)', () => {
    const cases: [number, number[]][] = [
      [10,    [1, 2, 3]],
      [100,   [1, 2, 3]],
      [1,     [1, 2, 3]],
      [0.10,  [1, 2, 3]],
      [33.33, [1, 2, 3]],
      [7,     [1, 2, 3, 4]],
      [99.99, [1, 2]],
      [1000,  [1, 2, 3, 4, 5, 6, 7]],
    ]
    for (const [total, ids] of cases) {
      const splits = computeEqualSplits(total, ids)
      const sum = splits.reduce((s, r) => Math.round((s + r.amount) * 100) / 100, 0)
      expect(sum).toBe(total)
    }
  })

  it('preserves member IDs in order', () => {
    const result = computeEqualSplits(30, [42, 7, 99])
    expect(result.map(r => r.member_id)).toEqual([42, 7, 99])
  })

  it('$10 / 4: no rounding needed', () => {
    const result = computeEqualSplits(10, [1, 2, 3, 4])
    expect(result.every(r => r.amount === 2.50)).toBe(true)
  })
})
