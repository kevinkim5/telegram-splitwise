import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { simplifyDebts, type NamedBalance } from '@/lib/balances'
import { parseChatId } from '@/lib/parse-params'

const BOT_TOKEN = process.env.BOT_TOKEN

export async function POST(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const [group] = await sql`SELECT id, title FROM groups WHERE chat_id = ${chatIdBig} AND deleted_at IS NULL`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const callerMember = await getGroupMember(group.id as number, user.id)
  if (!callerMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const members = await sql`
    SELECT id, first_name, last_name, username FROM members WHERE group_id = ${group.id}
  `
  const memberInfoMap = new Map(members.map(m => [
    m.id as number,
    { name: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`, username: m.username as string | null },
  ]))
  const memberIds = members.map(m => m.id as number)

  // Calculate net balances (same logic as /balances)
  const netByCurrency = new Map<string, Map<number, number>>()
  const getOrInit = (currency: string) => {
    if (!netByCurrency.has(currency)) {
      netByCurrency.set(currency, new Map(memberIds.map(id => [id, 0])))
    }
    return netByCurrency.get(currency)!
  }

  const splits = await sql`
    SELECT e.paid_by_member_id, e.currency, es.member_id, es.amount
    FROM expenses e JOIN expense_splits es ON es.expense_id = e.id
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

  const allDebts = [...netByCurrency.entries()].flatMap(([cur, curMap]) => {
    const balances: NamedBalance[] = [...curMap.entries()].map(([memberId, netAmount]) => ({
      member_id: memberId,
      member_name: memberInfoMap.get(memberId)?.name ?? 'Unknown',
      net_amount: Math.round(netAmount * 100) / 100,
      currency: cur,
    }))
    return simplifyDebts(balances)
  })

  if (allDebts.length === 0) {
    return NextResponse.json({ error: 'All settled up — nothing to notify' }, { status: 400 })
  }

  if (!BOT_TOKEN) {
    return NextResponse.json({ error: 'Bot not configured' }, { status: 500 })
  }

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const display = (memberId: number) => {
    const info = memberInfoMap.get(memberId)
    if (!info) return 'Unknown'
    return info.username ? `@${esc(info.username)}` : esc(info.name)
  }

  // Group debts by debtor
  const byDebtor = new Map<number, typeof allDebts>()
  for (const d of allDebts) {
    if (!byDebtor.has(d.from_member_id)) byDebtor.set(d.from_member_id, [])
    byDebtor.get(d.from_member_id)!.push(d)
  }

  const sections = [...byDebtor.entries()].map(([debtorId, debts]) => {
    const header = `<b>${display(debtorId)}</b> owes:`
    const rows = debts.map(d => `  • ${display(d.to_member_id)}  ${d.currency} ${d.amount.toFixed(2)}`)
    return [header, ...rows].join('\n')
  })

  const message = [
    `💰 <b>${esc(group.title as string)}</b> — outstanding balances`,
    '',
    sections.join('\n\n'),
  ].join('\n')

  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
  })
  const result = await res.json()
  if (!result.ok) {
    console.error('Telegram sendMessage failed:', JSON.stringify(result))
    return NextResponse.json({ error: 'Failed to send message to group' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
