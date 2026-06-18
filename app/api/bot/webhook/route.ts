import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'

const BOT_TOKEN = process.env.BOT_TOKEN!
const WEBAPP_URL = process.env.WEBAPP_URL!
const TELEGRAM_APP_URL = process.env.TELEGRAM_APP_URL // e.g. https://t.me/kevin_tele_splitwise_bot/split

async function callTelegram(method: string, body: object) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!data.ok) console.error(`Telegram ${method} failed:`, JSON.stringify(data))
  return data
}

async function handleMessage(message: {
  chat: { id: number; type: string; title?: string; first_name?: string }
  from?: { id: number; first_name: string; last_name?: string; username?: string }
  text?: string
}) {
  const { chat, from, text } = message

  if (!from) return

  // Auto-register the sender as a member of this chat
  await sql`
    INSERT INTO groups (chat_id, title)
    VALUES (${chat.id}, ${chat.title ?? chat.first_name ?? 'Private Chat'})
    ON CONFLICT (chat_id) DO UPDATE SET title = EXCLUDED.title
  `

  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${chat.id}`

  await sql`
    INSERT INTO members (group_id, telegram_user_id, first_name, last_name, username)
    VALUES (${group.id}, ${from.id}, ${from.first_name}, ${from.last_name ?? null}, ${from.username ?? null})
    ON CONFLICT (group_id, telegram_user_id) DO UPDATE
      SET first_name = EXCLUDED.first_name,
          last_name  = EXCLUDED.last_name,
          username   = EXCLUDED.username
  `

  if (text && /^\/start(@\w+)?$/.test(text.split(' ')[0])) {
    const chatTitle = encodeURIComponent(chat.title ?? chat.first_name ?? 'Chat')
    const isGroup = chat.type === 'group' || chat.type === 'supergroup'
    console.log(`/start in chat ${chat.id} (${chat.type})`)

    if (isGroup && TELEGRAM_APP_URL) {
      await callTelegram('sendMessage', {
        chat_id: chat.id,
        text: 'Ready to split! Tap the button to split.',
        reply_markup: {
          inline_keyboard: [[
            { text: 'Split now!', url: `${TELEGRAM_APP_URL}?startapp=${chat.id}` },
          ]],
        },
      })
    } else {
      const webAppUrl = `${WEBAPP_URL}?chatId=${chat.id}&chatTitle=${chatTitle}`
      await callTelegram('sendMessage', {
        chat_id: chat.id,
        text: 'Ready to split! Tap the button to split.',
        reply_markup: {
          inline_keyboard: [[
            { text: 'Split now!', web_app: { url: webAppUrl } },
          ]],
        },
      })
    }
  }
}

export async function POST(request: Request) {
  try {
    const update = await request.json()

    if (update.message) {
      await handleMessage(update.message)
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Webhook error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 }) // Always 200 to Telegram
  }
}
