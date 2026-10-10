export const ADMIN_PAGE_SIZE = 50

export function pageCount(total: number, size: number = ADMIN_PAGE_SIZE): number {
  return Math.max(1, Math.ceil(total / size))
}

// The page number from a query string value: whole numbers only, clamped into 1..last page, so a
// stale or hand-edited link never shows an empty page or throws.
export function parsePage(raw: string | undefined, total: number, size: number = ADMIN_PAGE_SIZE): number {
  const last = pageCount(total, size)
  const n = /^\d+$/.test(raw ?? '') ? parseInt(raw as string, 10) : 1
  return Math.min(Math.max(n, 1), last)
}

// "51–100 of 137"
export function rangeLabel(page: number, total: number, size: number = ADMIN_PAGE_SIZE): string {
  if (total === 0) return '0 of 0'
  const from = (page - 1) * size + 1
  const to = Math.min(page * size, total)
  return `${from}–${to} of ${total}`
}
