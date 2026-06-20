import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { simplifyDebts, type NamedBalance } from '@/lib/balances'
import { parseChatId } from '@/lib/parse-params'
import type { SimplifiedDebt } from '@/types'

export async function GET(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const [group] = await sql`SELECT id, currency FROM groups WHERE chat_id = ${chatIdBig}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const member = await getGroupMember(group.id as number, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const members = await sql`
    SELECT id, first_name, last_name FROM members WHERE group_id = ${group.id}
  `
  const memberNameMap = new Map(members.map(m => [
    m.id as number,
    `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`,
  ]))
  const memberIds = members.map(m => m.id as number)

  // Track net balance per (currency, member): positive = owed money, negative = owes
  const netByCurrency = new Map<string, Map<number, number>>()

  const getOrInit = (currency: string) => {
    if (!netByCurrency.has(currency)) {
      netByCurrency.set(currency, new Map(memberIds.map(id => [id, 0])))
    }
    return netByCurrency.get(currency)!
  }

  const splits = await sql`
    SELECT e.paid_by_member_id, e.currency, es.member_id, es.amount
    FROM expenses e
    JOIN expense_splits es ON es.expense_id = e.id
    WHERE e.group_id = ${group.id} AND e.deleted_at IS NULL
  `
  for (const r of splits) {
    const payer = r.paid_by_member_id as number
    const splitter = r.member_id as number
    const amount = parseFloat(r.amount as string)
    const cur = r.currency as string
    if (payer !== splitter) {
      const map = getOrInit(cur)
      map.set(payer, (map.get(payer) ?? 0) + amount)
      map.set(splitter, (map.get(splitter) ?? 0) - amount)
    }
  }

  const settlements = await sql`
    SELECT from_member_id, to_member_id, amount, currency FROM settlements
    WHERE group_id = ${group.id} AND deleted_at IS NULL
  `
  for (const r of settlements) {
    const from = r.from_member_id as number
    const to = r.to_member_id as number
    const amount = parseFloat(r.amount as string)
    const cur = r.currency as string
    const map = getOrInit(cur)
    map.set(from, (map.get(from) ?? 0) + amount)
    map.set(to, (map.get(to) ?? 0) - amount)
  }

  // Build per-currency balances and simplified debts
  const balances_by_currency: Record<string, NamedBalance[]> = {}
  const simplified_debts: SimplifiedDebt[] = []

  for (const [cur, memberMap] of netByCurrency.entries()) {
    const currencyBalances: NamedBalance[] = [...memberMap.entries()]
      .map(([memberId, netAmount]) => ({
        member_id: memberId,
        member_name: memberNameMap.get(memberId) ?? 'Unknown',
        net_amount: Math.round(netAmount * 100) / 100,
        currency: cur,
      }))
    balances_by_currency[cur] = currencyBalances
    simplified_debts.push(...simplifyDebts(currencyBalances))
  }

  // Flat balances array for the header summary (all currencies, deduplicated by member)
  const flatBalances: NamedBalance[] = memberIds.map(memberId => {
    const netAcross = [...netByCurrency.values()].reduce(
      (sum, map) => sum + (map.get(memberId) ?? 0), 0
    )
    return {
      member_id: memberId,
      member_name: memberNameMap.get(memberId) ?? 'Unknown',
      net_amount: Math.round(netAcross * 100) / 100,
      currency: group.currency as string,
    }
  })

  return NextResponse.json({ balances: flatBalances, balances_by_currency, simplified_debts })
}
