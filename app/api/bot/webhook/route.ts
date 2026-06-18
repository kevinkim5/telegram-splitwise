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
    const webAppUrl = `${WEBAPP_URL}?chatId=${chat.id}&chatTitle=${chatTitle}`
    console.log(`/start in chat ${chat.id} (${chat.type}), webAppUrl: ${webAppUrl}`)

    const isGroup = chat.type === 'group' || chat.type === 'supergroup'

    if (isGroup) {
      // web_app inline buttons don't work in groups — set a persistent menu button instead
      await callTelegram('setChatMenuButton', {
        chat_id: chat.id,
        menu_button: {
          type: 'web_app',
          text: '💰 Splitwise',
          web_app: { url: webAppUrl },
        },
      })
      await callTelegram('sendMessage', {
        chat_id: chat.id,
        text: '💰 Splitwise is ready! Tap the button next to the message input to open it.',
      })
    } else {
      await callTelegram('sendMessage', {
        chat_id: chat.id,
        text: '💰 Open Splitwise to manage your group expenses.',
        reply_markup: {
          inline_keyboard: [[
            { text: '💰 Open Splitwise', web_app: { url: webAppUrl } },
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
