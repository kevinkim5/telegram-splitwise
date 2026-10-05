// Receipt images are downscaled client-side to well under this. The cap keeps us below
// Vercel's 4.5 MB request body limit with headroom.
export const MAX_RECEIPT_BYTES = 4 * 1024 * 1024

export type ReceiptMediaType = 'image/jpeg' | 'image/png' | 'image/webp'

const EXTENSIONS: Record<ReceiptMediaType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
}

export function receiptExtension(type: ReceiptMediaType): string {
  return EXTENSIONS[type]
}

// Identify the image from its magic bytes. The client-supplied Content-Type is never trusted.
export function detectReceiptImageType(bytes: Uint8Array): ReceiptMediaType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
    bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  ) {
    return 'image/png'
  }
  // WebP: "RIFF" <4 byte size> "WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

export type ReadImageResult =
  | { ok: true; bytes: Uint8Array; type: ReceiptMediaType }
  | { ok: false; status: number; error: string }

// Read and validate a raw image request body.
export async function readReceiptImage(request: Request): Promise<ReadImageResult> {
  const declared = Number(request.headers.get('content-length') ?? 0)
  if (declared > MAX_RECEIPT_BYTES) {
    return { ok: false, status: 413, error: 'Image is too large' }
  }
  const bytes = new Uint8Array(await request.arrayBuffer())
  if (bytes.length === 0) return { ok: false, status: 400, error: 'No image provided' }
  if (bytes.length > MAX_RECEIPT_BYTES) {
    return { ok: false, status: 413, error: 'Image is too large' }
  }
  const type = detectReceiptImageType(bytes)
  if (!type) return { ok: false, status: 415, error: 'Unsupported image type (use JPEG, PNG or WebP)' }
  return { ok: true, bytes, type }
}
