import type { SimplifiedDebt } from '@/types'

export interface NamedBalance {
  member_id: number
  member_name: string
  net_amount: number
  currency: string
}

export function simplifyDebts(balances: NamedBalance[]): SimplifiedDebt[] {
  const creditors = balances
    .filter(b => b.net_amount > 0.005)
    .map(b => ({ ...b, net_amount: Math.round(b.net_amount * 100) / 100 }))

  const debtors = balances
    .filter(b => b.net_amount < -0.005)
    .map(b => ({ ...b, net_amount: Math.round(Math.abs(b.net_amount) * 100) / 100 }))

  // Sort ascending so pop() yields the largest
  creditors.sort((a, b) => a.net_amount - b.net_amount)
  debtors.sort((a, b) => a.net_amount - b.net_amount)

  const results: SimplifiedDebt[] = []

  while (creditors.length && debtors.length) {
    const cred = creditors.pop()!
    const debt = debtors.pop()!
    const amount = Math.round(Math.min(cred.net_amount, debt.net_amount) * 100) / 100

    if (amount > 0.005) {
      results.push({
        from_member_id: debt.member_id,
        from_name: debt.member_name,
        to_member_id: cred.member_id,
        to_name: cred.member_name,
        amount,
        currency: cred.currency,
      })
    }

    const remCred = Math.round((cred.net_amount - amount) * 100) / 100
    const remDebt = Math.round((debt.net_amount - amount) * 100) / 100

    if (remCred > 0.005) {
      creditors.push({ ...cred, net_amount: remCred })
      creditors.sort((a, b) => a.net_amount - b.net_amount)
    }
    if (remDebt > 0.005) {
      debtors.push({ ...debt, net_amount: remDebt })
      debtors.sort((a, b) => a.net_amount - b.net_amount)
    }
  }

  return results
}
