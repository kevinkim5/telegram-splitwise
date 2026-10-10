// Search and date filtering for the expense list. Shared by the screen (presets, labels, building the
// request) and the API route (validating and escaping what arrives).

export interface DateRange { from: string | null; to: string | null } // YYYY-MM-DD, inclusive, either end may be open
export interface ExpenseFilters { q: string; range: DateRange }

export const NO_DATE: DateRange = { from: null, to: null }
export const NO_FILTERS: ExpenseFilters = { q: '', range: NO_DATE }
export const MAX_QUERY_LENGTH = 100

const pad = (n: number) => String(n).padStart(2, '0')
export const ymd = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

// A real calendar date in YYYY-MM-DD form (rejects 2026-02-30 and the like)
export function isValidYmd(s: unknown): s is string {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(y!, m! - 1, d!))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m! - 1 && dt.getUTCDate() === d
}

function parseLocal(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

// If both ends are set and reversed, put them the right way round
export function normalizeRange(r: DateRange): DateRange {
  if (r.from && r.to && r.from > r.to) return { from: r.to, to: r.from }
  return r
}

export const hasRange = (r: DateRange) => !!(r.from || r.to)
export const hasFilters = (f: ExpenseFilters) => f.q.trim() !== '' || hasRange(f.range)

// ── presets ──
export type PresetKey = 'today' | 'yesterday' | 'week' | 'month' | 'lastMonth' | 'last30'
export const PRESETS: { key: PresetKey; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'lastMonth', label: 'Last month' },
  { key: 'last30', label: 'Last 30 days' },
]

// Weeks run Monday to Sunday
export function presetRange(key: PresetKey, today: Date): DateRange {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  switch (key) {
    case 'today': return { from: ymd(t), to: ymd(t) }
    case 'yesterday': { const y = addDays(t, -1); return { from: ymd(y), to: ymd(y) } }
    case 'week': {
      const monday = addDays(t, -((t.getDay() + 6) % 7))
      return { from: ymd(monday), to: ymd(addDays(monday, 6)) }
    }
    case 'month': return { from: ymd(new Date(t.getFullYear(), t.getMonth(), 1)), to: ymd(new Date(t.getFullYear(), t.getMonth() + 1, 0)) }
    case 'lastMonth': return { from: ymd(new Date(t.getFullYear(), t.getMonth() - 1, 1)), to: ymd(new Date(t.getFullYear(), t.getMonth(), 0)) }
    case 'last30': return { from: ymd(addDays(t, -29)), to: ymd(t) }
  }
}

export function matchPreset(r: DateRange, today: Date): PresetKey | null {
  for (const p of PRESETS) {
    const pr = presetRange(p.key, today)
    if (pr.from === r.from && pr.to === r.to) return p.key
  }
  return null
}

// ── labels ──
export function rangeLabel(r: DateRange, today: Date): string {
  const preset = matchPreset(r, today)
  if (preset) return PRESETS.find(p => p.key === preset)!.label
  const withYear = (s: string) => parseLocal(s).getFullYear() !== today.getFullYear()
  const dm = (s: string) =>
    parseLocal(s).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(withYear(s) ? { year: 'numeric' as const } : {}) })
  const short = (s: string, weekday = false) =>
    weekday ? `${parseLocal(s).toLocaleDateString('en-GB', { weekday: 'short' })} ${dm(s)}` : dm(s)
  if (r.from && r.to && r.from === r.to) return short(r.from, true)
  if (r.from && r.to) {
    const a = parseLocal(r.from), b = parseLocal(r.to)
    // "1–6 Oct" when both ends share a month and year
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear() && !withYear(r.from)) {
      return `${a.getDate()}–${short(r.to)}`
    }
    return `${short(r.from)} – ${short(r.to)}`
  }
  if (r.from) return `Since ${short(r.from)}`
  if (r.to) return `Until ${short(r.to)}`
  return ''
}

// ── request / validation ──
export const PAGE_SIZE = 30
export const MAX_PAGE_LIMIT = 300

// page (1-based) is the simple form; offset + limit let "Load more" append, and a quiet refresh re-request
// everything already loaded in one call (limit is capped)
export function buildExpensesQuery(o: { page?: number; offset?: number; limit?: number; filters: ExpenseFilters }): string {
  const p = new URLSearchParams()
  if (o.offset !== undefined) p.set('offset', String(o.offset))
  else p.set('page', String(o.page ?? 1))
  if (o.limit !== undefined) p.set('limit', String(o.limit))
  const q = o.filters.q.trim().slice(0, MAX_QUERY_LENGTH)
  if (q) p.set('q', q)
  const r = normalizeRange(o.filters.range)
  if (r.from) p.set('from', r.from)
  if (r.to) p.set('to', r.to)
  return p.toString()
}

// Server side: limit 1..MAX_PAGE_LIMIT (default PAGE_SIZE); an explicit offset wins over page
export function parsePaging(sp: URLSearchParams): { page: number; limit: number; offset: number } {
  const int = (k: string) => { const n = parseInt(sp.get(k) ?? '', 10); return Number.isFinite(n) ? n : null }
  const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, int('limit') ?? PAGE_SIZE))
  const page = Math.max(1, int('page') ?? 1)
  const off = int('offset')
  const offset = off !== null ? Math.max(0, off) : (page - 1) * limit
  return { page, limit, offset }
}

// Escape the characters that mean something to LIKE, so searching "50%" or "a_b" finds exactly that
export const escapeLike = (s: string) => s.replace(/[\\%_]/g, c => '\\' + c)

export type ParsedFilterParams =
  | { ok: true; q: string | null; from: string | null; to: string | null }
  | { ok: false; error: string }

export function parseFilterParams(sp: URLSearchParams): ParsedFilterParams {
  const rawQ = (sp.get('q') ?? '').replace(/\s+/g, ' ').trim()
  const q = rawQ ? rawQ.slice(0, MAX_QUERY_LENGTH) : null
  const f = sp.get('from') || null
  const t = sp.get('to') || null
  if ((f && !isValidYmd(f)) || (t && !isValidYmd(t))) return { ok: false, error: 'Invalid date (use YYYY-MM-DD)' }
  const r = normalizeRange({ from: f, to: t })
  return { ok: true, q, from: r.from, to: r.to }
}

// Settlements have no description to search, so they follow the date range only (and are left out
// while a text search is active). `createdAt` is an ISO timestamp; compared by local calendar date.
export function inRange(dateLike: string, r: DateRange): boolean {
  const d = ymd(new Date(dateLike))
  return (!r.from || d >= r.from) && (!r.to || d <= r.to)
}
