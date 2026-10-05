import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { r2Configured, receiptKey, signedGetUrl } from '@/lib/r2'

const ENV = ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'] as const
const saved: Record<string, string | undefined> = {}

beforeEach(() => { for (const k of ENV) saved[k] = process.env[k] })
afterEach(() => { for (const k of ENV) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k] } })

function configure() {
  process.env.R2_ACCOUNT_ID = 'acct123'
  process.env.R2_ACCESS_KEY_ID = 'AKIATEST'
  process.env.R2_SECRET_ACCESS_KEY = 'secret'
  process.env.R2_BUCKET = 'receipts-bucket'
}

describe('r2', () => {
  it('reports unconfigured until all four variables are set', () => {
    for (const k of ENV) delete process.env[k]
    expect(r2Configured()).toBe(false)
    configure()
    expect(r2Configured()).toBe(true)
    delete process.env.R2_BUCKET
    expect(r2Configured()).toBe(false)
  })

  it('returns null for a signed URL when unconfigured', async () => {
    for (const k of ENV) delete process.env[k]
    expect(await signedGetUrl('receipts/1/2.jpg')).toBeNull()
  })

  it('signs a short-lived GET URL against the bucket endpoint', async () => {
    configure()
    const url = new URL((await signedGetUrl('receipts/1/2-abc.jpg', 600))!)
    expect(url.host).toBe('acct123.r2.cloudflarestorage.com')
    expect(url.pathname).toBe('/receipts-bucket/receipts/1/2-abc.jpg')
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600')
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy()
    expect(url.searchParams.get('X-Amz-Credential')).toContain('AKIATEST')
  })

  it('builds unique, group-scoped keys', () => {
    const a = receiptKey(7, 42, 'jpg')
    const b = receiptKey(7, 42, 'jpg')
    expect(a).toMatch(/^receipts\/7\/42-[0-9a-f-]{36}\.jpg$/)
    expect(a).not.toBe(b)
  })
})
