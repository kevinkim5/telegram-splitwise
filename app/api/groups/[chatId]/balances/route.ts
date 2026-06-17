import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { simplifyDebts } from '@/lib/balances'

export async function GET(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await props.params

  const { rows: [group] } = await sql`SELECT id FROM groups WHERE chat_id = ${params.chatId}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { rows: memberRows } = await sql`
    SELECT id, first_name, last_name, username FROM members WHERE group_id = ${group.id}
  `
  const memberInfo = new Map(memberRows.map(m => [m.id, m]))

  const { rows: expCurrencies } = await sql`
    SELECT DISTINCT currency FROM expenses WHERE group_id = ${group.id} AND deleted_at IS NULL
  `
  const { rows: setlCurrencies } = await sql`
    SELECT DISTINCT currency FROM settlements WHERE group_id = ${group.id} AND deleted_at IS NULL
  `
  const currencies = [...new Set([...expCurrencies, ...setlCurrencies].map(r => r.currency as string))]

  const byCurrency: Record<string, unknown> = {}

  for (const currency of currencies) {
    const netBalance = new Map<number, number>()
    for (const m of memberRows) netBalance.set(m.id as number, 0)

    const { rows: splits } = await sql`
      SELECT e.paid_by, es.member_id, es.amount
      FROM expenses e JOIN expense_splits es ON es.expense_id = e.id
      WHERE e.group_id = ${group.id} AND e.currency = ${currency} AND e.deleted_at IS NULL
    `
    for (const r of splits) {
      if (r.paid_by !== r.member_id) {
        netBalance.set(r.paid_by as number, (netBalance.get(r.paid_by as number) ?? 0) + (r.amount as number))
        netBalance.set(r.member_id as number, (netBalance.get(r.member_id as number) ?? 0) - (r.amount as number))
      }
    }

    const { rows: settlements } = await sql`
      SELECT from_member, to_member, amount FROM settlements
      WHERE group_id = ${group.id} AND currency = ${currency} AND deleted_at IS NULL
    `
    for (const r of settlements) {
      netBalance.set(r.from_member as number, (netBalance.get(r.from_member as number) ?? 0) + (r.amount as number))
      netBalance.set(r.to_member as number, (netBalance.get(r.to_member as number) ?? 0) - (r.amount as number))
    }

    const net = [...netBalance.entries()].map(([memberId, netAmount]) => {
      const m = memberInfo.get(memberId) ?? {}
      return { member_id: memberId, ...m, net_amount: Math.round(netAmount * 100) / 100 }
    })

    const rawTxs = simplifyDebts(netBalance)
    const simplified_transactions = rawTxs.map(t => ({
      from_member_id: t.fromMemberId,
      from_first_name: (memberInfo.get(t.fromMemberId) as Record<string, unknown>)?.first_name ?? '',
      from_last_name: (memberInfo.get(t.fromMemberId) as Record<string, unknown>)?.last_name ?? null,
      to_member_id: t.toMemberId,
      to_first_name: (memberInfo.get(t.toMemberId) as Record<string, unknown>)?.first_name ?? '',
      to_last_name: (memberInfo.get(t.toMemberId) as Record<string, unknown>)?.last_name ?? null,
      amount: t.amount,
      currency,
    }))

    byCurrency[currency] = { net, simplified_transactions }
  }

  return NextResponse.json({ by_currency: byCurrency })
}
