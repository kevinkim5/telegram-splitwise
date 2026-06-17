export interface NetBalance {
  memberId: number
  amount: number
}

export interface Transaction {
  fromMemberId: number
  toMemberId: number
  amount: number
}

export function simplifyDebts(netMap: Map<number, number>): Transaction[] {
  const creditors: [number, number][] = [] // [amount, memberId]
  const debtors: [number, number][] = []   // [amount, memberId]

  for (const [memberId, amount] of netMap) {
    if (amount > 0.005) creditors.push([amount, memberId])
    else if (amount < -0.005) debtors.push([Math.abs(amount), memberId])
  }

  // Sort descending so pop() gives us max
  creditors.sort((a, b) => a[0] - b[0])
  debtors.sort((a, b) => a[0] - b[0])

  const transactions: Transaction[] = []

  while (creditors.length && debtors.length) {
    const [creditAmt, creditor] = creditors.pop()!
    const [debtAmt, debtor] = debtors.pop()!

    const settled = Math.round(Math.min(creditAmt, debtAmt) * 100) / 100
    transactions.push({ fromMemberId: debtor, toMemberId: creditor, amount: settled })

    const remCredit = Math.round((creditAmt - settled) * 100) / 100
    const remDebt = Math.round((debtAmt - settled) * 100) / 100

    if (remCredit > 0.005) {
      creditors.push([remCredit, creditor])
      creditors.sort((a, b) => a[0] - b[0])
    }
    if (remDebt > 0.005) {
      debtors.push([remDebt, debtor])
      debtors.sort((a, b) => a[0] - b[0])
    }
  }

  return transactions
}
