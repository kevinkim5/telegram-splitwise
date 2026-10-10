import { PRESETS, hasRange, parseFilterParams, presetRange, type DateRange } from '@/lib/expense-filter'

// Search + date filter for the admin Expenses tab. It lives in the URL (?q=&from=&to=) so a plain GET
// form drives it and a filtered view can be bookmarked or shared; the rules are the app's own
// (parseFilterParams: text in description, category or payer; inclusive dates; a reversed range is swapped).
export interface AdminExpenseFilter { q: string; from: string | null; to: string | null; error: string | null }

export function parseAdminFilter(sp: { q?: string; from?: string; to?: string }): AdminExpenseFilter {
  const p = new URLSearchParams()
  if (sp.q) p.set('q', sp.q)
  if (sp.from) p.set('from', sp.from)
  if (sp.to) p.set('to', sp.to)
  const r = parseFilterParams(p)
  if (!r.ok) return { q: '', from: null, to: null, error: r.error }
  return { q: r.q ?? '', from: r.from, to: r.to, error: null }
}

export const isFiltered = (f: AdminExpenseFilter) => f.q !== '' || hasRange(f)

// Today's date as a Date in Singapore time (the admin shows days in Singapore time)
export function todaySg(now: Date = new Date()): Date {
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Singapore' }))
}

export function presetLinks(today: Date): { key: string; label: string; range: DateRange }[] {
  return PRESETS.map(p => ({ key: p.key, label: p.label, range: presetRange(p.key, today) }))
}

// Link to the Expenses tab with the given filter (and the deleted toggle kept)
export function expensesHref(groupId: number, f: { q: string; from: string | null; to: string | null }, opts: { deleted?: boolean; page?: number } = {}): string {
  const q = new URLSearchParams({ tab: 'expenses' })
  if (f.q) q.set('q', f.q)
  if (f.from) q.set('from', f.from)
  if (f.to) q.set('to', f.to)
  if (opts.deleted) q.set('deleted', '1')
  if (opts.page && opts.page > 1) q.set('page', String(opts.page))
  return `/admin/${groupId}?${q.toString()}`
}
