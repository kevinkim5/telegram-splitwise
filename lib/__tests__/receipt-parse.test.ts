import { describe, expect, it } from 'vitest'
import { EMPTY_RECEIPT, isEmptyReceipt, normalizeParsedReceipt } from '@/lib/receipt-parse'

const today = new Date('2026-10-05T12:00:00Z')

describe('normalizeParsedReceipt', () => {
  it('passes through clean values', () => {
    expect(normalizeParsedReceipt({
      merchant: ' Ichiran Ramen ', total: 3250.5, currency: 'jpy', date: '2026-10-03', category: '🍜 Food',
    }, today)).toEqual({
      merchant: 'Ichiran Ramen', total: 3250.5, currency: 'JPY', date: '2026-10-03', category: '🍜 Food',
    })
  })

  it('rounds totals to 2 decimals and rejects non-positive or absurd amounts', () => {
    expect(normalizeParsedReceipt({ total: 12.345 }, today).total).toBe(12.35)
    expect(normalizeParsedReceipt({ total: 0 }, today).total).toBeNull()
    expect(normalizeParsedReceipt({ total: -5 }, today).total).toBeNull()
    expect(normalizeParsedReceipt({ total: 1e12 }, today).total).toBeNull()
    expect(normalizeParsedReceipt({ total: '12.00' }, today).total).toBeNull()
    expect(normalizeParsedReceipt({ total: NaN }, today).total).toBeNull()
  })

  it('rejects malformed, impossible, future and ancient dates', () => {
    expect(normalizeParsedReceipt({ date: '03/10/2026' }, today).date).toBeNull()
    expect(normalizeParsedReceipt({ date: '2026-02-31' }, today).date).toBeNull()
    expect(normalizeParsedReceipt({ date: '2027-01-01' }, today).date).toBeNull()
    expect(normalizeParsedReceipt({ date: '1999-12-31' }, today).date).toBeNull()
    expect(normalizeParsedReceipt({ date: '2026-10-06' }, today).date).toBe('2026-10-06') // timezone skew allowed
  })

  it('only accepts known categories, matching with or without the emoji', () => {
    expect(normalizeParsedReceipt({ category: '🚕 Taxi' }, today).category).toBe('🚕 Taxi')
    expect(normalizeParsedReceipt({ category: 'taxi' }, today).category).toBe('🚕 Taxi')
    expect(normalizeParsedReceipt({ category: 'Groceries' }, today).category).toBeNull()
  })

  it('rejects invalid currency codes', () => {
    expect(normalizeParsedReceipt({ currency: 'S$' }, today).currency).toBeNull()
    expect(normalizeParsedReceipt({ currency: 'SGDX' }, today).currency).toBeNull()
  })

  it('truncates long merchant names and collapses whitespace', () => {
    const m = normalizeParsedReceipt({ merchant: `A${' '.repeat(5)}B${'x'.repeat(300)}` }, today).merchant!
    expect(m.length).toBe(100)
    expect(m.startsWith('A B')).toBe(true)
  })

  it('returns an empty result for junk input', () => {
    expect(normalizeParsedReceipt(null, today)).toEqual(EMPTY_RECEIPT)
    expect(normalizeParsedReceipt('hello', today)).toEqual(EMPTY_RECEIPT)
    expect(normalizeParsedReceipt({}, today)).toEqual(EMPTY_RECEIPT)
  })
})

describe('isEmptyReceipt', () => {
  it('is true only when nothing useful was read', () => {
    expect(isEmptyReceipt(EMPTY_RECEIPT)).toBe(true)
    expect(isEmptyReceipt({ ...EMPTY_RECEIPT, currency: 'SGD' })).toBe(true) // currency alone isn't useful
    expect(isEmptyReceipt({ ...EMPTY_RECEIPT, total: 5 })).toBe(false)
  })
})
