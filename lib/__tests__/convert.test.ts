import { describe, expect, it } from 'vitest'
import { breakdown, sumConverted } from '@/lib/convert'

const rates = { JPY: 0.0091, USD: 1.34 }

describe('sumConverted', () => {
  it('sums several currencies, including the target itself, into one signed total', () => {
    const r = sumConverted(
      [{ currency: 'JPY', net: -3000 }, { currency: 'USD', net: -18.5 }, { currency: 'SGD', net: 10 }],
      rates, 'SGD',
    )
    expect(r.total).toBe(-42.09) // -27.30 - 24.79 + 10
    expect(r.missing).toEqual([])
    expect(r.usedAny).toBe(true)
  })

  it('nets opposite signs across currencies', () => {
    expect(sumConverted([{ currency: 'JPY', net: 3000 }, { currency: 'SGD', net: -10 }], rates, 'SGD').total).toBe(17.3)
  })

  it('reports a currency with no rate instead of treating it as zero', () => {
    const r = sumConverted([{ currency: 'JPY', net: -3000 }, { currency: 'THB', net: -500 }], rates, 'SGD')
    expect(r.total).toBe(-27.3)
    expect(r.missing).toEqual(['THB'])
    expect(r.usedAny).toBe(true)
  })

  it('says nothing was converted when no rate is available at all', () => {
    const r = sumConverted([{ currency: 'THB', net: -500 }], rates, 'SGD')
    expect(r).toEqual({ total: 0, missing: ['THB'], usedAny: false })
    expect(sumConverted([{ currency: 'JPY', net: 1 }], null, 'SGD').usedAny).toBe(false)
  })

  it('rounds once at the end, not per currency', () => {
    // 0.004 + 0.004 would round to 0.00 + 0.00 per line, but 0.008 overall rounds to 0.01
    expect(sumConverted([{ currency: 'AAA', net: 0.004 }, { currency: 'BBB', net: 0.004 }], { AAA: 1, BBB: 1 }, 'SGD').total).toBe(0.01)
  })

  it('handles an empty list and a target-only list', () => {
    expect(sumConverted([], rates, 'SGD')).toEqual({ total: 0, missing: [], usedAny: false })
    expect(sumConverted([{ currency: 'SGD', net: -5.5 }], null, 'SGD').total).toBe(-5.5)
  })
})

describe('breakdown', () => {
  it('lists the original amounts with their direction', () => {
    expect(breakdown([{ currency: 'JPY', net: -3000 }, { currency: 'SGD', net: 10 }])).toBe('−JPY 3000.00 · +SGD 10.00')
  })
})
