import { describe, expect, it } from 'vitest'
import { fmtMs, outcomeFromStatus, timingInsertValues } from '../scan-timing'
import { newScanTiming } from '../receipt-parse'

describe('outcomeFromStatus', () => {
  it('maps the route statuses to outcomes', () => {
    expect(outcomeFromStatus(200)).toBe('ok')
    expect(outcomeFromStatus(422)).toBe('unreadable')
    expect(outcomeFromStatus(429)).toBe('rate_limited')
    expect(outcomeFromStatus(503)).toBe('overloaded')
    expect(outcomeFromStatus(504)).toBe('timeout')
    expect(outcomeFromStatus(502)).toBe('error')
    expect(outcomeFromStatus(500)).toBe('error')
  })
})

describe('fmtMs', () => {
  it('shows milliseconds under a second and seconds above', () => {
    expect(fmtMs(850)).toBe('850 ms')
    expect(fmtMs(3240)).toBe('3.2 s')
    expect(fmtMs(1000)).toBe('1.0 s')
    expect(fmtMs(null)).toBe('—')
    expect(fmtMs(undefined)).toBe('—')
  })
  it('copes with numeric strings from the database', () => {
    expect(fmtMs('2500' as unknown as number)).toBe('2.5 s')
  })
})

describe('timingInsertValues', () => {
  it('rounds the time, never goes negative, and turns empty fields into null', () => {
    const v = timingInsertValues({ telegramUserId: 9, outcome: 'ok', totalMs: 1234.6, timing: newScanTiming() })
    expect(v).toMatchObject({ user: 9, model: null, totalMs: 1235, geminiMs: null, attempts: null, imageBytes: null, promptTokens: null })
    expect(timingInsertValues({ telegramUserId: 9, outcome: 'ok', totalMs: -5, timing: newScanTiming() }).totalMs).toBe(0)
  })
})
