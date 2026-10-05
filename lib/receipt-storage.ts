import { createHmac, timingSafeEqual } from 'crypto'
import { BlobNotFoundError, del, get, put } from '@vercel/blob'

// Receipt images live in a PRIVATE Vercel Blob store. Nothing is public: clients are given a
// short-lived link to our own route (see receiptViewUrl), which streams the image from the store.
//
// The Blob read-write token (BLOB_READ_WRITE_TOKEN) is added to the project automatically when a
// Blob store is connected. It also doubles as the secret that signs those links, so no extra
// configuration is needed and staging/production can never accept each other's links.

export const LINK_TTL_SECONDS = 15 * 60

export function storageConfigured(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN
}

export function receiptKey(groupId: number, expenseId: number, ext: string): string {
  // Random suffix so a replaced receipt never reuses a pathname (and old links stop working).
  return `receipts/${groupId}/${expenseId}-${crypto.randomUUID()}.${ext}`
}

export async function putReceipt(key: string, body: Uint8Array, contentType: string): Promise<void> {
  await put(key, Buffer.from(body), {
    access: 'private',
    contentType,
    addRandomSuffix: false,
    allowOverwrite: false,
  })
}

export async function deleteReceipt(key: string): Promise<void> {
  try {
    await del(key)
  } catch (err) {
    if (!(err instanceof BlobNotFoundError)) throw err // already gone is fine
  }
}

// Returns null when the object doesn't exist.
export async function readReceipt(key: string): Promise<{ stream: ReadableStream<Uint8Array>; contentType: string } | null> {
  const res = await get(key, { access: 'private' })
  if (!res || res.statusCode !== 200) return null
  return { stream: res.stream, contentType: res.blob.contentType }
}

// ─── Signed view links ────────────────────────────────────────────────────────

function sign(chatId: string, expenseId: number, key: string, exp: number): string {
  const secret = process.env.BLOB_READ_WRITE_TOKEN ?? ''
  return createHmac('sha256', secret).update(`${chatId}|${expenseId}|${key}|${exp}`).digest('hex')
}

// A same-origin URL that works in an <img src> (which can't send auth headers). It is bound to the
// expense and to the current image, so replacing or removing the receipt invalidates old links.
export function receiptViewUrl(chatId: string, expenseId: number, key: string, ttlSeconds = LINK_TTL_SECONDS): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds
  const sig = sign(chatId, expenseId, key, exp)
  return `/api/groups/${chatId}/expenses/${expenseId}/receipt?exp=${exp}&sig=${sig}`
}

export function verifyReceiptLink(
  chatId: string,
  expenseId: number,
  key: string,
  expParam: string | null,
  sigParam: string | null,
  nowMs: number = Date.now(),
): boolean {
  if (!storageConfigured() || !expParam || !sigParam) return false
  if (!/^\d{1,12}$/.test(expParam) || !/^[0-9a-f]{64}$/.test(sigParam)) return false
  const exp = Number(expParam)
  if (exp * 1000 < nowMs) return false
  const expected = Buffer.from(sign(chatId, expenseId, key, exp), 'hex')
  const given = Buffer.from(sigParam, 'hex')
  return expected.length === given.length && timingSafeEqual(expected, given)
}
