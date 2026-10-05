import { describe, expect, it } from 'vitest'
import { MAX_RECEIPT_BYTES, detectReceiptImageType, readReceiptImage } from '@/lib/receipt-image'

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10])
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50])

describe('detectReceiptImageType', () => {
  it('recognises JPEG, PNG and WebP by magic bytes', () => {
    expect(detectReceiptImageType(jpeg)).toBe('image/jpeg')
    expect(detectReceiptImageType(png)).toBe('image/png')
    expect(detectReceiptImageType(webp)).toBe('image/webp')
  })

  it('rejects other formats and truncated input', () => {
    expect(detectReceiptImageType(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull() // GIF
    expect(detectReceiptImageType(new TextEncoder().encode('<svg xmlns='))).toBeNull()
    expect(detectReceiptImageType(new Uint8Array([0xff, 0xd8]))).toBeNull()
    expect(detectReceiptImageType(new Uint8Array())).toBeNull()
  })
})

describe('readReceiptImage', () => {
  const req = (body: Uint8Array, headers: Record<string, string> = {}) =>
    new Request('http://x/upload', { method: 'POST', body: body as BodyInit, headers })

  it('accepts a valid image and ignores the declared content type', async () => {
    const r = await readReceiptImage(req(jpeg, { 'content-type': 'text/plain' }))
    expect(r).toMatchObject({ ok: true, type: 'image/jpeg' })
  })

  it('rejects an empty body', async () => {
    const r = await readReceiptImage(req(new Uint8Array()))
    expect(r).toMatchObject({ ok: false, status: 400 })
  })

  it('rejects non-images with 415', async () => {
    const r = await readReceiptImage(req(new TextEncoder().encode('not an image')))
    expect(r).toMatchObject({ ok: false, status: 415 })
  })

  it('rejects an oversized declared length without reading the body', async () => {
    const r = await readReceiptImage(req(jpeg, { 'content-length': String(MAX_RECEIPT_BYTES + 1) }))
    expect(r).toMatchObject({ ok: false, status: 413 })
  })

  it('rejects an oversized actual body', async () => {
    const big = new Uint8Array(MAX_RECEIPT_BYTES + 1)
    big.set(jpeg)
    const r = await readReceiptImage(req(big))
    expect(r).toMatchObject({ ok: false, status: 413 })
  })
})
