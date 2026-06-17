import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getAuthUser } from '@/lib/auth'
import { simplifyDebts } from '@/lib/balances'

export async function GET(request: Request, { params }: { params: { chatId: string } }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows: [group] } = await sql`SELECT id FROM groups WHERE chat_id = ${params.chatId}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  // Build member lookup
  const { rows: memberRows } = await sql`
    SELECT id, first_name, last_name, username FROM members WHERE group_id = ${group.id}
  `
  const memberInfo = new Map(memberRows.map(m => [m.id, m]))

  // Collect distinct currencies from expenses + settlements
  const { rows: expCurrencies } = await sql`
    SELECT DISTINCT currency FROM expenses WHERE group_id = ${group.id} AND deleted_at IS NULL
  `
  const { rows: setlCurrencies } = await sql`
    SELECT DISTINCT currency FROM settlements WHERE group_id = ${group.id} AND deleted_at IS NULL
  `
  const currencies = [...new Set([...expCurrencies, ...setlCurrencies].map(r => r.currency))]

  const byCurrency: Record<string, unknown> = {}

  for (const currency of currencies) {
    const netBalance = new Map<number, number>()
    for (const m of memberRows) netBalance.set(m.id, 0)

    // Expense splits
    const { rows: splits } = await sql`
      SELECT e.paid_by, es.member_id, es.amount
      FROM expenses e JOIN expense_splits es ON es.expense_id = e.id
      WHERE e.group_id = ${group.id} AND e.currency = ${currency} AND e.deleted_at IS NULL
    `
    for (const r of splits) {
      if (r.paid_by !== r.member_id) {
        netBalance.set(r.paid_by, (netBalance.get(r.paid_by) ?? 0) + r.amount)
        netBalance.set(r.member_id, (netBalance.get(r.member_id) ?? 0) - r.amount)
      }
    }

    // Settlements
    const { rows: settlements } = await sql`
      SELECT from_member, to_member, amount FROM settlements
      WHERE group_id = ${group.id} AND currency = ${currency} AND deleted_at IS NULL
    `
    for (const r of settlements) {
      netBalance.set(r.from_member, (netBalance.get(r.from_member) ?? 0) + r.amount)
      netBalance.set(r.to_member, (netBalance.get(r.to_member) ?? 0) - r.amount)
    }

    const net = [...netBalance.entries()].map(([memberId, netAmount]) => {
      const m = memberInfo.get(memberId) ?? {}
      return { member_id: memberId, ...m, net_amount: Math.round(netAmount * 100) / 100 }
    })

    const rawTxs = simplifyDebts(netBalance)
    const simplified_transactions = rawTxs.map(t => ({
      from_member_id: t.fromMemberId,
      from_first_name: memberInfo.get(t.fromMemberId)?.first_name ?? '',
      from_last_name: memberInfo.get(t.fromMemberId)?.last_name ?? null,
      to_member_id: t.toMemberId,
      to_first_name: memberInfo.get(t.toMemberId)?.first_name ?? '',
      to_last_name: memberInfo.get(t.toMemberId)?.last_name ?? null,
      amount: t.amount,
      currency,
    }))

    byCurrency[currency] = { net, simplified_transactions }
  }

  return NextResponse.json({ by_currency: byCurrency })
}
