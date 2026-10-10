import { describe, expect, it } from 'vitest'
import { combineTotals } from '@/lib/totals-all'

const summary = [
  { currency: 'JPY', group_total: 6000, my_total: 2000, count: 2 },
  { currency: 'USD', group_total: 100, my_total: 40, count: 3 },
  { currency: 'SGD', group_total: 50, my_total: 25, count: 1 },
]
const byCategory = [
  { currency: 'JPY', category: '🍜 Food', group_total: 4000, my_total: 1500, count: 1 },
  { currency: 'JPY', category: null, group_total: 2000, my_total: 500, count: 1 },
  { currency: 'USD', category: '🍜 Food', group_total: 60, my_total: 20, count: 2 },
  { currency: 'USD', category: '✈️ Flights', group_total: 40, my_total: 20, count: 1 },
  { currency: 'SGD', category: '🍜 Food', group_total: 50, my_total: 25, count: 1 },
]
const RATES = { JPY: 0.0091, USD: 1.34 }

describe('combineTotals', () => {
  it('converts every currency into SGD and adds them up', () => {
    const r = combineTotals(summary, byCategory, RATES, 'SGD')
    expect(r).toMatchObject({ ok: true, count: 6 })
    if (!r.ok) return
    expect(r.group_total).toBe(238.6)  // 54.60 + 134 + 50
    expect(r.my_total).toBe(96.8)       // 18.20 + 53.60 + 25
  })

  it('merges categories across currencies, biggest first, keeping the uncategorised bucket', () => {
    const r = combineTotals(summary, byCategory, RATES, 'SGD')
    if (!r.ok) throw new Error('expected ok')
    // Food: 36.40 + 80.40 + 50 = 166.80 ; Flights: 53.60 ; none: 18.20
    expect(r.categories).toEqual([
      { category: '🍜 Food', group_total: 166.8, my_total: 65.45, count: 4 }, // 13.65 + 26.80 + 25
      { category: '✈️ Flights', group_total: 53.6, my_total: 26.8, count: 1 },
      { category: null, group_total: 18.2, my_total: 4.55, count: 1 },
    ])
  })

  it('category totals add up to the overall total', () => {
    const r = combineTotals(summary, byCategory, RATES, 'SGD')
    if (!r.ok) throw new Error('expected ok')
    expect(Math.round(r.categories.reduce((a, c) => a + c.group_total, 0) * 100) / 100).toBe(r.group_total)
  })

  it('gives no total at all, and names the currency, if a rate is missing', () => {
    expect(combineTotals(summary, byCategory, { JPY: 0.0091 }, 'SGD')).toEqual({ ok: false, missing: ['USD'] })
    expect(combineTotals(summary, byCategory, null, 'SGD')).toEqual({ ok: false, missing: ['JPY', 'USD'] })
  })

  it('needs no rates when everything is already in the target currency', () => {
    const r = combineTotals([summary[2]], [byCategory[4]], null, 'SGD')
    expect(r).toMatchObject({ ok: true, group_total: 50, my_total: 25, count: 1 })
  })
})
