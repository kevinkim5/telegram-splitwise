import { AwsClient } from 'aws4fetch'

// Cloudflare R2 via its S3-compatible API. The bucket stays private: the app uploads on the
// server and hands out short-lived signed URLs for viewing.

function config() {
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET) return null
  return {
    base: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}`,
    client: new AwsClient({
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      service: 's3',
      region: 'auto',
    }),
  }
}

export function r2Configured(): boolean {
  return config() !== null
}

function objectUrl(base: string, key: string): string {
  return `${base}/${key.split('/').map(encodeURIComponent).join('/')}`
}

export function receiptKey(groupId: number, expenseId: number, ext: string): string {
  // Random suffix so a replaced receipt never reuses a URL that may still be cached.
  return `receipts/${groupId}/${expenseId}-${crypto.randomUUID()}.${ext}`
}

export async function putObject(key: string, body: Uint8Array, contentType: string): Promise<void> {
  const c = config()
  if (!c) throw new Error('R2 is not configured')
  const res = await c.client.fetch(objectUrl(c.base, key), {
    method: 'PUT',
    headers: { 'content-type': contentType },
    body: body as BodyInit,
  })
  if (!res.ok) throw new Error(`R2 upload failed: ${res.status}`)
}

export async function deleteObject(key: string): Promise<void> {
  const c = config()
  if (!c) return
  const res = await c.client.fetch(objectUrl(c.base, key), { method: 'DELETE' })
  // 404 is fine: the object is already gone.
  if (!res.ok && res.status !== 404) throw new Error(`R2 delete failed: ${res.status}`)
}

export async function signedGetUrl(key: string, expiresSeconds = 900): Promise<string | null> {
  const c = config()
  if (!c) return null
  const url = new URL(objectUrl(c.base, key))
  url.searchParams.set('X-Amz-Expires', String(expiresSeconds))
  const signed = await c.client.sign(url.toString(), { method: 'GET', aws: { signQuery: true } })
  return signed.url
}
