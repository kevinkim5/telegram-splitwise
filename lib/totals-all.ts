import { CONVERT_TO } from '@/lib/convert'

interface SummaryRow { currency: string; group_total: number; my_total: number; count: number }
interface CategoryRow { currency: string; category: string | null; group_total: number; my_total: number; count: number }

export type CombinedTotals =
  | {
      ok: true
      group_total: number
      my_total: number
      count: number
      categories: { category: string | null; group_total: number; my_total: number; count: number }[]
    }
  | { ok: false; missing: string[] } // currencies we have no rate for

const round2 = (n: number) => Math.round(n * 100) / 100

// The "All" view of the Totals page: every currency converted into `target` at the given rates and
// added up. Unrounded until the end, so rounding error doesn't build up. If any currency has no
// rate there is no total at all (never a partial one that silently leaves money out).
export function combineTotals(
  summary: SummaryRow[],
  byCategory: CategoryRow[],
  rates: Record<string, number> | null,
  target: string = CONVERT_TO,
): CombinedTotals {
  const rateOf = (cur: string) => (cur === target ? 1 : rates?.[cur])
  const missing = [...new Set(summary.map(s => s.currency).filter(c => !rateOf(c)))]
  if (missing.length > 0) return { ok: false, missing }

  let group = 0, mine = 0, count = 0
  for (const s of summary) {
    const r = rateOf(s.currency)!
    group += s.group_total * r
    mine += s.my_total * r
    count += s.count
  }

  const merged = new Map<string | null, { group: number; mine: number; count: number }>()
  for (const c of byCategory) {
    const r = rateOf(c.currency)!
    const m = merged.get(c.category) ?? { group: 0, mine: 0, count: 0 }
    m.group += c.group_total * r
    m.mine += c.my_total * r
    m.count += c.count
    merged.set(c.category, m)
  }
  const categories = [...merged.entries()]
    .map(([category, m]) => ({ category, group_total: round2(m.group), my_total: round2(m.mine), count: m.count }))
    .sort((a, b) => b.group_total - a.group_total)

  return { ok: true, group_total: round2(group), my_total: round2(mine), count, categories }
}
