import { sql } from '@/lib/sql'
import { simplifyDebts, type NamedBalance } from '@/lib/balances'
import type { SimplifiedDebt } from '@/types'

// Who owes whom in a group. The sums are done by the database (a handful of rows come back, not one
// row per split) and in whole cents, so nothing accumulates floating-point error. Both the balances
// page and the checks used when recording a settlement or notifying the group go through here, so
// there is one calculation.

export interface LedgerMember { id: number; first_name: string; last_name: string | null }
// Expense splits summed per (currency, who paid, who owes): one row each, self-splits left out
export interface ExpensePair { currency: string; payer: number; member: number; cents: number; firstId: number }
// Live settlements summed per (currency, from, to)
export interface SettlementPair { currency: string; from: number; to: number; cents: number; firstId: number }

export interface Ledger {
  balances: NamedBalance[] // one per member, all currencies added together, in the group's currency
  balances_by_currency: Record<string, NamedBalance[]>
  simplified_debts: SimplifiedDebt[]
}

const name = (m: { first_name: string; last_name: string | null }) => `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`

// Net cents per currency per member: positive = is owed money, negative = owes. Currencies appear in
// the order they first occur (by expense id, then settlement id) so the output order is stable.
export function netCents(
  memberIds: number[],
  expenses: ExpensePair[],
  settlements: SettlementPair[],
): Map<string, Map<number, number>> {
  const live = expenses.filter(e => e.payer !== e.member) // a payer's own share is not a debt
  const firstSeen = new Map<string, number>()
  const note = (currency: string, rank: number) => {
    const prev = firstSeen.get(currency)
    if (prev === undefined || rank < prev) firstSeen.set(currency, rank)
  }
  // settlement ids are ranked after every expense id, so a currency that only has settlements comes last
  const AFTER_EXPENSES = 1e12
  for (const e of live) note(e.currency, e.firstId)
  const withExpenses = new Set(live.map(e => e.currency))
  for (const s of settlements) if (!withExpenses.has(s.currency)) note(s.currency, AFTER_EXPENSES + s.firstId)

  const net = new Map<string, Map<number, number>>()
  for (const [currency] of [...firstSeen.entries()].sort((a, b) => a[1] - b[1])) {
    net.set(currency, new Map(memberIds.map(id => [id, 0])))
  }
  for (const e of live) {
    const map = net.get(e.currency)!
    map.set(e.payer, (map.get(e.payer) ?? 0) + e.cents)
    map.set(e.member, (map.get(e.member) ?? 0) - e.cents)
  }
  for (const s of settlements) {
    const map = net.get(s.currency)!
    map.set(s.from, (map.get(s.from) ?? 0) + s.cents)
    map.set(s.to, (map.get(s.to) ?? 0) - s.cents)
  }
  return net
}

export function buildLedger(
  members: LedgerMember[],
  expenses: ExpensePair[],
  settlements: SettlementPair[],
  groupCurrency: string,
): Ledger {
  const memberIds = members.map(m => m.id)
  const names = new Map(members.map(m => [m.id, name(m)]))
  const net = netCents(memberIds, expenses, settlements)

  const balances_by_currency: Record<string, NamedBalance[]> = {}
  const simplified_debts: SimplifiedDebt[] = []
  for (const [currency, byMember] of net) {
    const rows: NamedBalance[] = [...byMember.entries()].map(([memberId, cents]) => ({
      member_id: memberId,
      member_name: names.get(memberId) ?? 'Unknown',
      net_amount: cents / 100,
      currency,
    }))
    balances_by_currency[currency] = rows
    simplified_debts.push(...simplifyDebts(rows))
  }

  const balances: NamedBalance[] = memberIds.map(memberId => {
    let cents = 0
    for (const byMember of net.values()) cents += byMember.get(memberId) ?? 0
    return { member_id: memberId, member_name: names.get(memberId) ?? 'Unknown', net_amount: cents / 100, currency: groupCurrency }
  })
  return { balances, balances_by_currency, simplified_debts }
}

// One round trip: members, expense sums and settlement sums are read together, in a single
// read-only transaction so they describe the same moment even if someone is saving an expense.
export async function loadLedger(groupId: number, groupCurrency: string): Promise<Ledger> {
  const [members, expenseRows, settlementRows] = await sql.transaction([
    sql`SELECT id, first_name, last_name FROM members WHERE group_id = ${groupId} ORDER BY id`,
    sql`
      SELECT e.currency, e.paid_by_member_id AS payer, es.member_id AS member,
             (SUM(es.amount) * 100)::bigint AS cents, MIN(e.id) AS first_id
      FROM expenses e
      JOIN expense_splits es ON es.expense_id = e.id
      WHERE e.group_id = ${groupId} AND e.deleted_at IS NULL AND es.member_id <> e.paid_by_member_id
      GROUP BY e.currency, e.paid_by_member_id, es.member_id
    `,
    sql`
      SELECT currency, from_member_id AS "from", to_member_id AS "to",
             (SUM(amount) * 100)::bigint AS cents, MIN(id) AS first_id
      FROM settlements
      WHERE group_id = ${groupId} AND deleted_at IS NULL
      GROUP BY currency, from_member_id, to_member_id
    `,
  ], { isolationLevel: 'RepeatableRead', readOnly: true })

  return buildLedger(
    members.map(m => ({ id: Number(m.id), first_name: String(m.first_name), last_name: (m.last_name as string | null) ?? null })),
    expenseRows.map(r => ({ currency: String(r.currency), payer: Number(r.payer), member: Number(r.member), cents: Number(r.cents), firstId: Number(r.first_id) })),
    settlementRows.map(r => ({ currency: String(r.currency), from: Number(r.from), to: Number(r.to), cents: Number(r.cents), firstId: Number(r.first_id) })),
    groupCurrency,
  )
}

export async function loadSimplifiedDebts(groupId: number, groupCurrency = 'SGD'): Promise<SimplifiedDebt[]> {
  return (await loadLedger(groupId, groupCurrency)).simplified_debts
}
