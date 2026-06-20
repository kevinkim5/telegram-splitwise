import { describe, it, expect } from 'vitest'
import { verifyWebhookSecret } from '../webhook-auth'

describe('verifyWebhookSecret', () => {
  it('returns true when correct secret is provided', () => {
    expect(verifyWebhookSecret('mysecret', 'mysecret')).toBe(true)
  })

  it('returns false when wrong secret is provided', () => {
    expect(verifyWebhookSecret('wrong', 'mysecret')).toBe(false)
  })

  it('returns false when header is missing (null)', () => {
    expect(verifyWebhookSecret(null, 'mysecret')).toBe(false)
  })

  it('returns false when header is undefined', () => {
    expect(verifyWebhookSecret(undefined, 'mysecret')).toBe(false)
  })

  it('returns false when header is empty string', () => {
    expect(verifyWebhookSecret('', 'mysecret')).toBe(false)
  })

  it('returns true when no secret is configured (dev mode)', () => {
    expect(verifyWebhookSecret(null, undefined)).toBe(true)
    expect(verifyWebhookSecret(undefined, undefined)).toBe(true)
    expect(verifyWebhookSecret('anything', undefined)).toBe(true)
  })

  it('returns true when no secret is configured (empty string treated as unconfigured)', () => {
    expect(verifyWebhookSecret(null, '')).toBe(true)
  })

  it('is case-sensitive', () => {
    expect(verifyWebhookSecret('MySecret', 'mysecret')).toBe(false)
    expect(verifyWebhookSecret('MYSECRET', 'mysecret')).toBe(false)
  })
})
