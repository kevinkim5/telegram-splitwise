export function parseChatId(value: string): bigint | null {
  try {
    const n = BigInt(value)
    return n !== 0n ? n : null  // 0 is invalid; negative is valid (Telegram group IDs)
  } catch {
    return null
  }
}

export function parseResourceId(value: string): number | null {
  const n = parseInt(value, 10)
  if (!Number.isInteger(n) || n <= 0) return null
  if (String(n) !== value) return null  // reject '1abc', '1.5', etc.
  return n
}
