import { describe, it, expect } from 'vitest'
import { parseChatId, parseResourceId } from '../parse-params'

describe('parseChatId', () => {
  it('accepts a positive private-chat ID', () => {
    expect(parseChatId('123456789')).toBe(123456789n)
  })

  it('accepts a negative group chat ID (Telegram groups are negative)', () => {
    expect(parseChatId('-1001234567890')).toBe(-1001234567890n)
  })

  it('returns null for zero', () => {
    expect(parseChatId('0')).toBeNull()
  })

  it('returns null for non-numeric string', () => {
    expect(parseChatId('abc')).toBeNull()
  })

  it('returns null for a decimal string (BigInt throws)', () => {
    expect(parseChatId('1.5')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseChatId('')).toBeNull()
  })

  it('returns null for a string with mixed content', () => {
    expect(parseChatId('123abc')).toBeNull()
  })
})

describe('parseResourceId', () => {
  it('accepts a valid positive integer string', () => {
    expect(parseResourceId('55')).toBe(55)
  })

  it('returns null for zero', () => {
    expect(parseResourceId('0')).toBeNull()
  })

  it('returns null for negative', () => {
    expect(parseResourceId('-1')).toBeNull()
  })

  it('returns null for non-numeric string', () => {
    expect(parseResourceId('abc')).toBeNull()
  })

  it('returns null for a decimal string', () => {
    expect(parseResourceId('1.5')).toBeNull()
  })

  it('returns null for a string with trailing letters', () => {
    expect(parseResourceId('1abc')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseResourceId('')).toBeNull()
  })
})
