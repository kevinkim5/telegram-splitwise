import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'

const BOT_TOKEN = process.env.BOT_TOKEN!
const WEBAPP_URL = process.env.WEBAPP_URL!

async function callTelegram(method: string, body: object) {
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return res.json()
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
    const webAppUrl = `${WEBAPP_URL}?chatId=${chat.id}&chatTitle=${chatTitle}`

    await callTelegram('sendMessage', {
      chat_id: chat.id,
      text: '💰 Open Splitwise to manage your group expenses.',
      reply_markup: {
        inline_keyboard: [[
          {
            text: '💰 Open Splitwise',
            web_app: { url: webAppUrl },
          },
        ]],
      },
    })
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
