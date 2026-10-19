import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { requireGroupMember } from '@/lib/group-access'
import { loadSimplifiedDebts } from '@/lib/group-balances'
import { buildPrivateMessages, NOTIFY_TARGET } from '@/lib/notify-message'
import { fetchRates } from '@/lib/rates'
import { parseChatId } from '@/lib/parse-params'
import { sendTelegramMessage } from '@/lib/telegram-send'

const BOT_TOKEN = process.env.BOT_TOKEN
const TELEGRAM_APP_URL = process.env.TELEGRAM_APP_URL // https://t.me/<bot>/<app>

// "Remind privately": each person who owes gets their own direct message with what they owe, and
// nothing is posted in the group. Telegram only lets the bot message people who have opened it, so
// the answer says who was reached and who was not.
export async function POST(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const access = await requireGroupMember(chatIdBig, user.id)
  if (!access.ok) return access.response
  const group = access.group

  const members = await sql`
    SELECT id, first_name, last_name, username, telegram_user_id FROM members WHERE group_id = ${group.id}
  `
  const info = new Map(members.map(m => [
    m.id as number,
    {
      name: `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`,
      username: m.username as string | null,
      telegramId: String(m.telegram_user_id),
    },
  ]))

  const allDebts = await loadSimplifiedDebts(group.id, group.currency)
  if (allDebts.length === 0) {
    return NextResponse.json({ error: 'All settled up — nothing to send' }, { status: 400 })
  }
  if (!BOT_TOKEN) return NextResponse.json({ error: 'Bot not configured' }, { status: 500 })

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const display = (memberId: number) => {
    const m = info.get(memberId)
    if (!m) return 'Unknown'
    return m.username ? `@${esc(m.username)}` : esc(m.name)
  }

  // Rates are a nicety: without them the messages list the original currencies
  const foreign = [...new Set(allDebts.map(d => d.currency).filter(c => c !== NOTIFY_TARGET))]
  const rates = foreign.length > 0 ? await fetchRates(foreign, NOTIFY_TARGET) : null
  const messages = buildPrivateMessages(group.title as string, allDebts, display, rates && rates.ok ? rates.rates : null)

  // A button that opens this group in the app, when the bot's app link is configured
  const extra = TELEGRAM_APP_URL
    ? { reply_markup: { inline_keyboard: [[{ text: 'Open Split', url: `${TELEGRAM_APP_URL}?startapp=${chatId}` }]] } }
    : {}

  const results = await Promise.all([...messages.entries()].map(async ([debtorId, text]) => {
    const m = info.get(debtorId)
    if (!m) return { name: 'Unknown', kind: 'failed' as const }
    const r = await sendTelegramMessage(BOT_TOKEN, m.telegramId, text, extra)
    if (!r.ok) console.error(`Private reminder not delivered (member ${debtorId}): ${r.kind}: ${r.description}`)
    return { name: m.name, kind: r.ok ? ('sent' as const) : r.kind }
  }))

  return NextResponse.json({
    ok: true,
    total: results.length,
    sent: results.filter(r => r.kind === 'sent').length,
    unreachable: results.filter(r => r.kind === 'unreachable').map(r => r.name),
    failed: results.filter(r => r.kind === 'failed').map(r => r.name),
  })
}
