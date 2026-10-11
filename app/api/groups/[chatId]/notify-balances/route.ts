import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { loadSimplifiedDebts } from '@/lib/group-balances'
import { buildNotifyMessage, NOTIFY_TARGET } from '@/lib/notify-message'
import { fetchRates } from '@/lib/rates'
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

  const allDebts = await loadSimplifiedDebts(group.id as number)

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

  // Rates are a nicety: if they can't be fetched the message still goes out in original currencies
  const foreign = [...new Set(allDebts.map(d => d.currency).filter(c => c !== NOTIFY_TARGET))]
  const rates = foreign.length > 0 ? await fetchRates(foreign, NOTIFY_TARGET) : null

  const message = buildNotifyMessage(
    group.title as string, allDebts, display, rates && rates.ok ? rates.rates : null)

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
