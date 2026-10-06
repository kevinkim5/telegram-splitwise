import { sql } from '@/lib/sql'
import { simplifyDebts, type NamedBalance } from '@/lib/balances'
import type { SimplifiedDebt } from '@/types'

// The simplified debts for a group, computed exactly as the balances page does (expenses and
// settlements netted per currency, then greedily matched). Used to check a settlement against
// what is actually owed at the moment it is recorded.
export async function loadSimplifiedDebts(groupId: number): Promise<SimplifiedDebt[]> {
  const members = await sql`SELECT id, first_name, last_name FROM members WHERE group_id = ${groupId}`
  const names = new Map(members.map(m => [
    m.id as number,
    `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`,
  ]))
  const memberIds = members.map(m => m.id as number)

  const net = new Map<string, Map<number, number>>()
  const forCurrency = (cur: string) => {
    if (!net.has(cur)) net.set(cur, new Map(memberIds.map(id => [id, 0])))
    return net.get(cur)!
  }

  const splits = await sql`
    SELECT e.paid_by_member_id, e.currency, es.member_id, es.amount
    FROM expenses e JOIN expense_splits es ON es.expense_id = e.id
    WHERE e.group_id = ${groupId} AND e.deleted_at IS NULL
  `
  for (const r of splits) {
    const payer = r.paid_by_member_id as number
    const splitter = r.member_id as number
    if (payer === splitter) continue
    const amount = parseFloat(r.amount as string)
    const map = forCurrency(r.currency as string)
    map.set(payer, (map.get(payer) ?? 0) + amount)
    map.set(splitter, (map.get(splitter) ?? 0) - amount)
  }

  const settlements = await sql`
    SELECT from_member_id, to_member_id, amount, currency FROM settlements
    WHERE group_id = ${groupId} AND deleted_at IS NULL
  `
  for (const r of settlements) {
    const amount = parseFloat(r.amount as string)
    const map = forCurrency(r.currency as string)
    map.set(r.from_member_id as number, (map.get(r.from_member_id as number) ?? 0) + amount)
    map.set(r.to_member_id as number, (map.get(r.to_member_id as number) ?? 0) - amount)
  }

  return [...net.entries()].flatMap(([cur, byMember]) => {
    const balances: NamedBalance[] = [...byMember.entries()].map(([memberId, netAmount]) => ({
      member_id: memberId,
      member_name: names.get(memberId) ?? 'Unknown',
      net_amount: Math.round(netAmount * 100) / 100,
      currency: cur,
    }))
    return simplifyDebts(balances)
  })
}
