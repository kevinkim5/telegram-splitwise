/**
 * Distributes totalAmount equally across memberIds, rounding to 2 decimal
 * places and assigning any rounding remainder to the last member so that
 * splits always sum exactly to totalAmount.
 */
export function computeEqualSplits(
  totalAmount: number,
  memberIds: number[]
): Array<{ member_id: number; amount: number }> {
  const n = memberIds.length
  if (n === 0) return []
  const share = Math.round((totalAmount / n) * 100) / 100
  const last = Math.round((totalAmount - share * (n - 1)) * 100) / 100
  return memberIds.map((id, i) => ({ member_id: id, amount: i === n - 1 ? last : share }))
}

/**
 * Distributes totalAmount proportionally by whole-number shares.
 * Rounding remainder is assigned to the last member.
 */
export function computeShareSplits(
  totalAmount: number,
  shares: Array<{ member_id: number; shares: number }>
): Array<{ member_id: number; amount: number }> {
  const totalShares = shares.reduce((sum, s) => sum + s.shares, 0)
  if (totalShares === 0) return []
  const result = shares.map(({ member_id, shares: n }) => ({
    member_id,
    amount: Math.round((totalAmount * n / totalShares) * 100) / 100,
  }))
  // Fix any rounding drift on the last member
  const sumSoFar = result.slice(0, -1).reduce((s, r) => s + r.amount, 0)
  if (result.length > 0) {
    result[result.length - 1].amount = Math.round((totalAmount - sumSoFar) * 100) / 100
  }
  return result
}
