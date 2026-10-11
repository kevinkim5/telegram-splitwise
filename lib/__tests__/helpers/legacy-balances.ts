// The balance calculation as it was before it moved into SQL (floats, one row per split). Kept only as
// the reference the new version is compared against.
import { simplifyDebts, type NamedBalance } from '../../balances'
import type { LedgerMember } from '../../group-balances'

export type SplitRow = { paid_by_member_id: number; currency: string; member_id: number; amount: string }
export type SettlementRow = { from_member_id: number; to_member_id: number; amount: string; currency: string }

export function legacy(members: LedgerMember[], splits: SplitRow[], settlements: SettlementRow[], groupCurrency: string) {
  const memberNameMap = new Map(members.map(m => [m.id, `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`]))
  const memberIds = members.map(m => m.id)
  const netByCurrency = new Map<string, Map<number, number>>()
  const getOrInit = (currency: string) => {
    if (!netByCurrency.has(currency)) netByCurrency.set(currency, new Map(memberIds.map(id => [id, 0])))
    return netByCurrency.get(currency)!
  }
  for (const r of splits) {
    const payer = r.paid_by_member_id, splitter = r.member_id, amount = parseFloat(r.amount), cur = r.currency
    if (payer !== splitter) {
      const map = getOrInit(cur)
      map.set(payer, (map.get(payer) ?? 0) + amount)
      map.set(splitter, (map.get(splitter) ?? 0) - amount)
    }
  }
  for (const r of settlements) {
    const amount = parseFloat(r.amount)
    const map = getOrInit(r.currency)
    map.set(r.from_member_id, (map.get(r.from_member_id) ?? 0) + amount)
    map.set(r.to_member_id, (map.get(r.to_member_id) ?? 0) - amount)
  }
  const balances_by_currency: Record<string, NamedBalance[]> = {}
  const simplified_debts: ReturnType<typeof simplifyDebts> = []
  for (const [cur, memberMap] of netByCurrency.entries()) {
    const rows: NamedBalance[] = [...memberMap.entries()].map(([memberId, netAmount]) => ({
      member_id: memberId, member_name: memberNameMap.get(memberId) ?? 'Unknown', net_amount: Math.round(netAmount * 100) / 100, currency: cur,
    }))
    balances_by_currency[cur] = rows
    simplified_debts.push(...simplifyDebts(rows))
  }
  const balances: NamedBalance[] = memberIds.map(memberId => {
    const netAcross = [...netByCurrency.values()].reduce((sum, map) => sum + (map.get(memberId) ?? 0), 0)
    return { member_id: memberId, member_name: memberNameMap.get(memberId) ?? 'Unknown', net_amount: Math.round(netAcross * 100) / 100, currency: groupCurrency }
  })
  return { balances, balances_by_currency, simplified_debts }
}

