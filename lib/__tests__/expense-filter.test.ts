import { describe, expect, it } from 'vitest'
import {
  buildExpensesQuery, escapeLike, hasFilters, inRange, isValidYmd, matchPreset, normalizeRange, parseFilterParams,
  presetRange, rangeLabel, ymd,
} from '@/lib/expense-filter'

const T = new Date(2026, 9, 6) // Tue 6 Oct 2026 (local)

describe('isValidYmd', () => {
  it('accepts real dates only', () => {
    expect(isValidYmd('2026-10-06')).toBe(true)
    expect(isValidYmd('2024-02-29')).toBe(true)
    for (const bad of ['2026-02-30', '2025-02-29', '2026-13-01', '2026-10-6', '06-10-2026', '', 'x', '2026-10-06T00:00', null, 5]) {
      expect(isValidYmd(bad)).toBe(false)
    }
  })
})

describe('presets', () => {
  it('computes each range from a given today', () => {
    expect(presetRange('today', T)).toEqual({ from: '2026-10-06', to: '2026-10-06' })
    expect(presetRange('yesterday', T)).toEqual({ from: '2026-10-05', to: '2026-10-05' })
    expect(presetRange('week', T)).toEqual({ from: '2026-10-05', to: '2026-10-11' })       // Mon–Sun
    expect(presetRange('month', T)).toEqual({ from: '2026-10-01', to: '2026-10-31' })
    expect(presetRange('lastMonth', T)).toEqual({ from: '2026-09-01', to: '2026-09-30' })
    expect(presetRange('last30', T)).toEqual({ from: '2026-09-07', to: '2026-10-06' })
  })

  it('handles Sunday (end of week), January (last month is December) and leap days', () => {
    expect(presetRange('week', new Date(2026, 9, 11))).toEqual({ from: '2026-10-05', to: '2026-10-11' })
    expect(presetRange('lastMonth', new Date(2026, 0, 15))).toEqual({ from: '2025-12-01', to: '2025-12-31' })
    expect(presetRange('month', new Date(2024, 1, 10))).toEqual({ from: '2024-02-01', to: '2024-02-29' })
    expect(presetRange('yesterday', new Date(2026, 2, 1))).toEqual({ from: '2026-02-28', to: '2026-02-28' })
  })

  it('recognises a range that is a preset', () => {
    expect(matchPreset(presetRange('month', T), T)).toBe('month')
    expect(matchPreset({ from: '2026-10-02', to: '2026-10-03' }, T)).toBeNull()
  })
})

describe('rangeLabel', () => {
  it('uses preset names, single days, ranges and open ends', () => {
    expect(rangeLabel(presetRange('month', T), T)).toBe('This month')
    expect(rangeLabel({ from: '2026-10-06', to: '2026-10-06' }, T)).toBe('Today')           // a single day that is today
    expect(rangeLabel({ from: '2026-10-03', to: '2026-10-03' }, T)).toBe('Sat 3 Oct')
    expect(rangeLabel({ from: '2026-10-01', to: '2026-10-04' }, T)).toBe('1–4 Oct')
    expect(rangeLabel({ from: '2026-09-28', to: '2026-10-04' }, T)).toBe('28 Sept – 4 Oct')
    expect(rangeLabel({ from: '2026-10-01', to: null }, T)).toBe('Since 1 Oct')
    expect(rangeLabel({ from: null, to: '2026-10-06' }, T)).toBe('Until 6 Oct')
  })

  it('adds the year only when it is not this year', () => {
    expect(rangeLabel({ from: '2025-12-24', to: '2025-12-24' }, T)).toBe('Wed 24 Dec 2025')
    expect(rangeLabel({ from: '2025-12-20', to: '2026-01-03' }, T)).toBe('20 Dec 2025 – 3 Jan')
  })
})

describe('normalizeRange / hasFilters', () => {
  it('swaps a reversed range and leaves open ends alone', () => {
    expect(normalizeRange({ from: '2026-10-06', to: '2026-10-01' })).toEqual({ from: '2026-10-01', to: '2026-10-06' })
    expect(normalizeRange({ from: '2026-10-06', to: null })).toEqual({ from: '2026-10-06', to: null })
  })
  it('knows when anything is applied', () => {
    expect(hasFilters({ q: '  ', range: { from: null, to: null } })).toBe(false)
    expect(hasFilters({ q: 'taxi', range: { from: null, to: null } })).toBe(true)
    expect(hasFilters({ q: '', range: { from: null, to: '2026-10-06' } })).toBe(true)
  })
})

describe('request building and parsing', () => {
  it('builds a query string with only what is set, trimmed, reversed ranges fixed', () => {
    expect(buildExpensesQuery({ page: 1, filters: { q: '', range: { from: null, to: null } } })).toBe('page=1')
    expect(buildExpensesQuery({ page: 2, filters: { q: '  taxi  ', range: { from: '2026-10-06', to: '2026-10-01' } } })).toBe('page=2&q=taxi&from=2026-10-01&to=2026-10-06')
    expect(buildExpensesQuery({ page: 1, filters: { q: 'a&b=c', range: { from: null, to: null } } })).toBe('page=1&q=a%26b%3Dc')
  })

  it('parses and validates what the API receives', () => {
    const p = (s: string) => parseFilterParams(new URLSearchParams(s))
    expect(p('page=1')).toEqual({ ok: true, q: null, from: null, to: null })
    expect(p('q=%20%20taxi%20%20to%20%20airport&from=2026-10-01')).toEqual({ ok: true, q: 'taxi to airport', from: '2026-10-01', to: null })
    expect(p('from=2026-10-09&to=2026-10-01')).toEqual({ ok: true, q: null, from: '2026-10-01', to: '2026-10-09' })
    expect(p('from=2026-02-30')).toEqual({ ok: false, error: 'Invalid date (use YYYY-MM-DD)' })
    expect(p('to=yesterday')).toMatchObject({ ok: false })
    const long = p('q=' + 'x'.repeat(500))
    expect(long.ok && long.q!.length).toBe(100)
  })

  it('escapes LIKE wildcards so they are searched literally', () => {
    expect(escapeLike('50%_off\\')).toBe('50\\%\\_off\\\\')
    expect(escapeLike('plain')).toBe('plain')
  })
})

describe('inRange', () => {
  it('is inclusive at both ends and open when an end is missing', () => {
    const r = { from: '2026-10-02', to: '2026-10-04' }
    expect(inRange(new Date(2026, 9, 2, 0, 5).toISOString(), r)).toBe(true)
    expect(inRange(new Date(2026, 9, 4, 23, 55).toISOString(), r)).toBe(true)
    expect(inRange(new Date(2026, 9, 1, 23, 59).toISOString(), r)).toBe(false)
    expect(inRange(new Date(2026, 9, 5, 0, 1).toISOString(), r)).toBe(false)
    expect(inRange(new Date(2026, 9, 5).toISOString(), { from: '2026-10-02', to: null })).toBe(true)
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})
