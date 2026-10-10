import { describe, expect, it } from 'vitest'
import { summarizeTotals } from '@/lib/group-totals'

const RATES = { JPY: 0.0091, USD: 1.34 }
const totals = [
  { currency: 'JPY', total: 6000 },
  { currency: 'USD', total: 100 },
  { currency: 'SGD', total: 50 },
]

describe('summarizeTotals', () => {
  it('sums everything into SGD, biggest first, with each currency converted', () => {
    const s = summarizeTotals(totals, RATES)
    expect(s.mode).toBe('converted')
    expect(s.total).toBe(238.6) // 54.60 + 134 + 50
    expect(s.rows).toEqual([
      { currency: 'USD', total: 100, converted: 134 },
      { currency: 'JPY', total: 6000, converted: 54.6 },
      { currency: 'SGD', total: 50, converted: 50 },
    ])
    expect(s.missing).toEqual([])
  })

  it('rounds once at the end, so cents do not drift', () => {
    const many = [{ currency: 'JPY', total: 1 }, { currency: 'USD', total: 1 }]
    expect(summarizeTotals(many, { JPY: 0.0091, USD: 0.0049 }).total).toBe(0.01) // 0.0140 → 0.01, not 0.01 + 0.00
  })

  it('never gives a partial total: a missing rate keeps the original amounts', () => {
    const s = summarizeTotals(totals, { JPY: 0.0091 })
    expect(s).toMatchObject({ mode: 'original', total: null, missing: ['USD'] })
  })

  it('shows originals while rates are still loading or failed (null)', () => {
    expect(summarizeTotals(totals, null)).toMatchObject({ mode: 'original', total: null, missing: ['JPY', 'USD'] })
  })

  it('an SGD-only group needs no rates and no breakdown', () => {
    expect(summarizeTotals([{ currency: 'SGD', total: 50.005 }], null)).toMatchObject({ mode: 'plain', total: 50.01, missing: [] })
  })

  it('a group with no expenses has nothing to show', () => {
    expect(summarizeTotals([], null)).toMatchObject({ mode: 'plain', total: null, rows: [] })
  })

  it('a single foreign currency still converts (so the headline is always SGD)', () => {
    const s = summarizeTotals([{ currency: 'JPY', total: 6000 }], RATES)
    expect(s).toMatchObject({ mode: 'converted', total: 54.6 })
  })
})
