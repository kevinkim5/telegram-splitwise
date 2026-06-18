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
