import type { ScanTiming } from '@/lib/receipt-parse'

export type ScanOutcome = 'ok' | 'unreadable' | 'rate_limited' | 'overloaded' | 'timeout' | 'error'

// How a scan ended, from the status the route is about to return (200 = read fine, 422 = answered but
// nothing readable, 429 / 503 / 504 = the provider's quota, overload or our time budget).
export function outcomeFromStatus(status: number): ScanOutcome {
  if (status === 200) return 'ok'
  if (status === 422) return 'unreadable'
  if (status === 429) return 'rate_limited'
  if (status === 503) return 'overloaded'
  if (status === 504) return 'timeout'
  return 'error'
}

export interface TimingRow {
  telegramUserId: number | string
  outcome: ScanOutcome
  totalMs: number
  timing: ScanTiming
}

// Best effort: the log must never break or slow a scan, so the caller does not await its failure.
export function timingInsertValues(r: TimingRow) {
  const t = r.timing
  return {
    user: r.telegramUserId, model: t.model || null, outcome: r.outcome, totalMs: Math.max(0, Math.round(r.totalMs)),
    geminiMs: t.geminiMs, attempts: t.attempts || null, httpStatus: t.httpStatus, imageBytes: t.imageBytes || null,
    promptTokens: t.promptTokens, thoughtTokens: t.thoughtTokens, outputTokens: t.outputTokens,
  }
}

// "3.2 s" / "850 ms"
export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(Number(ms))) return '—'
  const n = Number(ms)
  return n >= 1000 ? `${(n / 1000).toFixed(1)} s` : `${Math.round(n)} ms`
}
