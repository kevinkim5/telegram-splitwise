import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { simplifyDebts, type NamedBalance } from '@/lib/balances'

export async function GET(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const [group] = await sql`SELECT id, currency FROM groups WHERE chat_id = ${BigInt(chatId)}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const currency = group.currency as string
  const members = await sql`
    SELECT id, first_name, last_name FROM members WHERE group_id = ${group.id}
  `

  // Net balance per member: positive = owed money, negative = owes money
  const netBalance = new Map<number, number>()
  for (const m of members) netBalance.set(m.id as number, 0)

  // From expenses: payer gains what others owe them
  const splits = await sql`
    SELECT e.paid_by_member_id, es.member_id, es.amount
    FROM expenses e
    JOIN expense_splits es ON es.expense_id = e.id
    WHERE e.group_id = ${group.id} AND e.deleted_at IS NULL
  `
  for (const r of splits) {
    const payer = r.paid_by_member_id as number
    const splitter = r.member_id as number
    const amount = parseFloat(r.amount as string)

    // Payer gets credit for what others owe
    if (payer !== splitter) {
      netBalance.set(payer, (netBalance.get(payer) ?? 0) + amount)
      netBalance.set(splitter, (netBalance.get(splitter) ?? 0) - amount)
    }
  }

  // From settlements: from_member paid to_member, so from_member's debt decreases
  const settlements = await sql`
    SELECT from_member_id, to_member_id, amount FROM settlements
    WHERE group_id = ${group.id} AND deleted_at IS NULL
  `
  for (const r of settlements) {
    const from = r.from_member_id as number
    const to = r.to_member_id as number
    const amount = parseFloat(r.amount as string)
    netBalance.set(from, (netBalance.get(from) ?? 0) + amount)
    netBalance.set(to, (netBalance.get(to) ?? 0) - amount)
  }

  const memberMap = new Map(members.map(m => [
    m.id as number,
    `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`,
  ]))

  const balances: NamedBalance[] = [...netBalance.entries()].map(([memberId, netAmount]) => ({
    member_id: memberId,
    member_name: memberMap.get(memberId) ?? 'Unknown',
    net_amount: Math.round(netAmount * 100) / 100,
    currency,
  }))

  const simplified_debts = simplifyDebts(balances)

  return NextResponse.json({ currency, balances, simplified_debts })
}
