import { CONVERT_TO } from '@/lib/convert'

export interface CurrencyTotal { currency: string; total: number }

export interface TotalsSummary {
  // 'converted': every currency has a rate, so there is one SGD total
  // 'plain': nothing to convert (only SGD, or no totals)
  // 'original': rates not loaded yet, failed, or a currency has no rate: show the amounts as they are
  mode: 'converted' | 'plain' | 'original'
  total: number | null                                   // in CONVERT_TO, when converted/plain
  rows: { currency: string; total: number; converted: number | null }[] // biggest SGD value first when converted
  missing: string[]                                      // currencies without a rate
}

const round2 = (n: number) => Math.round(n * 100) / 100

// The group's spending across currencies as one SGD figure plus the per-currency breakdown. One
// rounded sum at the end (so cents don't drift), and never a partial total: if any currency lacks a
// rate the amounts stay in their own currencies.
export function summarizeTotals(totals: CurrencyTotal[], rates: Record<string, number> | null): TotalsSummary {
  const toTarget = (t: CurrencyTotal) => (t.currency === CONVERT_TO ? t.total : rates?.[t.currency] ? t.total * rates[t.currency]! : null)
  const rows = totals.map(t => {
    const v = toTarget(t)
    return { currency: t.currency, total: t.total, converted: v === null ? null : round2(v) }
  })
  const missing = totals.filter(t => t.currency !== CONVERT_TO && !rates?.[t.currency]).map(t => t.currency)

  if (totals.length === 0 || totals.every(t => t.currency === CONVERT_TO)) {
    return { mode: 'plain', total: totals.length ? round2(totals.reduce((a, t) => a + t.total, 0)) : null, rows, missing: [] }
  }
  if (missing.length > 0) return { mode: 'original', total: null, rows, missing }

  const sum = round2(totals.reduce((a, t) => a + (toTarget(t) as number), 0))
  return { mode: 'converted', total: sum, rows: [...rows].sort((a, b) => (b.converted ?? 0) - (a.converted ?? 0)), missing: [] }
}
