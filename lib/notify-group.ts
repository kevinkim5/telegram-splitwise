import { sql } from '@/lib/sql'
import { loadSimplifiedDebts } from '@/lib/group-debts'
import { buildNotifyMessage, NOTIFY_TARGET } from '@/lib/notify-message'
import { fetchRates } from '@/lib/rates'

export type NotifyGroupResult =
  | { ok: true }
  | { ok: false; status: number; error: string; settled?: boolean }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Posts the outstanding balances in the group's Telegram chat. Used by the Notify Group button and by
// the weekly reminder, so both send exactly the same message.
export async function postGroupBalances(group: { id: number; title: string }, chatId: string): Promise<NotifyGroupResult> {
  const members = await sql`
    SELECT id, first_name, last_name, username FROM members WHERE group_id = ${group.id}
  `
  const memberInfoMap = new Map(members.map(m => [
    m.id as number,
    { name: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`, username: m.username as string | null },
  ]))

  const allDebts = await loadSimplifiedDebts(group.id)
  if (allDebts.length === 0) {
    return { ok: false, status: 400, error: 'All settled up — nothing to notify', settled: true }
  }

  const token = process.env.BOT_TOKEN
  if (!token) return { ok: false, status: 500, error: 'Bot not configured' }

  const display = (memberId: number) => {
    const info = memberInfoMap.get(memberId)
    if (!info) return 'Unknown'
    return info.username ? `@${esc(info.username)}` : esc(info.name)
  }

  // Rates are a nicety: if they can't be fetched the message still goes out in original currencies
  const foreign = [...new Set(allDebts.map(d => d.currency).filter(c => c !== NOTIFY_TARGET))]
  const rates = foreign.length > 0 ? await fetchRates(foreign, NOTIFY_TARGET) : null

  const message = buildNotifyMessage(group.title, allDebts, display, rates && rates.ok ? rates.rates : null)

  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
  })
  const result = await res.json()
  if (!result.ok) {
    console.error('Telegram sendMessage failed:', JSON.stringify(result))
    return { ok: false, status: 500, error: 'Failed to send message to group' }
  }
  return { ok: true }
}
