import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { receiptKey, receiptViewUrl, storageConfigured, verifyReceiptLink } from '@/lib/receipt-storage'

let saved: string | undefined
beforeEach(() => { saved = process.env.BLOB_READ_WRITE_TOKEN; process.env.BLOB_READ_WRITE_TOKEN = 'token_one' })
afterEach(() => { if (saved === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = saved })

const parts = (url: string) => {
  const q = new URL(`http://x${url}`).searchParams
  return { exp: q.get('exp'), sig: q.get('sig') }
}

describe('storageConfigured', () => {
  it('follows BLOB_READ_WRITE_TOKEN', () => {
    expect(storageConfigured()).toBe(true)
    delete process.env.BLOB_READ_WRITE_TOKEN
    expect(storageConfigured()).toBe(false)
  })
})

describe('receiptKey', () => {
  it('is group scoped and unique per call', () => {
    const a = receiptKey(7, 42, 'jpg')
    expect(a).toMatch(/^receipts\/7\/42-[0-9a-f-]{36}\.jpg$/)
    expect(receiptKey(7, 42, 'jpg')).not.toBe(a)
  })
})

describe('receipt view links', () => {
  const KEY = 'receipts/7/42-abc.jpg'

  it('verifies a freshly issued link', () => {
    const { exp, sig } = parts(receiptViewUrl('-100', 42, KEY))
    expect(verifyReceiptLink('-100', 42, KEY, exp, sig)).toBe(true)
  })

  it('expires after the TTL', () => {
    const { exp, sig } = parts(receiptViewUrl('-100', 42, KEY, 60))
    const justBefore = (Number(exp) - 1) * 1000
    const justAfter = (Number(exp) + 1) * 1000
    expect(verifyReceiptLink('-100', 42, KEY, exp, sig, justBefore)).toBe(true)
    expect(verifyReceiptLink('-100', 42, KEY, exp, sig, justAfter)).toBe(false)
  })

  it('is bound to chat, expense and the exact image', () => {
    const { exp, sig } = parts(receiptViewUrl('-100', 42, KEY))
    expect(verifyReceiptLink('-101', 42, KEY, exp, sig)).toBe(false)
    expect(verifyReceiptLink('-100', 43, KEY, exp, sig)).toBe(false)
    expect(verifyReceiptLink('-100', 42, 'receipts/7/42-other.jpg', exp, sig)).toBe(false)
  })

  it('cannot be extended by editing exp', () => {
    const { exp, sig } = parts(receiptViewUrl('-100', 42, KEY, 60))
    expect(verifyReceiptLink('-100', 42, KEY, String(Number(exp) + 99999), sig)).toBe(false)
  })

  it('rejects malformed or missing parameters', () => {
    const { exp, sig } = parts(receiptViewUrl('-100', 42, KEY))
    expect(verifyReceiptLink('-100', 42, KEY, null, sig)).toBe(false)
    expect(verifyReceiptLink('-100', 42, KEY, exp, null)).toBe(false)
    expect(verifyReceiptLink('-100', 42, KEY, 'abc', sig)).toBe(false)
    expect(verifyReceiptLink('-100', 42, KEY, exp, 'zz'.repeat(32))).toBe(false)
    expect(verifyReceiptLink('-100', 42, KEY, exp, sig!.slice(0, 62))).toBe(false)
  })

  it('does not verify across stores (different token) or when storage is unconfigured', () => {
    const { exp, sig } = parts(receiptViewUrl('-100', 42, KEY))
    process.env.BLOB_READ_WRITE_TOKEN = 'token_two'
    expect(verifyReceiptLink('-100', 42, KEY, exp, sig)).toBe(false)
    delete process.env.BLOB_READ_WRITE_TOKEN
    expect(verifyReceiptLink('-100', 42, KEY, exp, sig)).toBe(false)
  })
})
