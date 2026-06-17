import { NextResponse } from 'next/server'

const BOT_TOKEN = process.env.BOT_TOKEN ?? ''
const WEBAPP_URL = process.env.WEBAPP_URL ?? ''

async function sendMessage(chatId: number, text: string, extra: Record<string, unknown> = {}) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, ...extra }),
  })
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  if (!BOT_TOKEN || params.token !== BOT_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const update = await request.json()
  const message = update.message
  if (!message?.text?.startsWith('/start')) return NextResponse.json({ ok: true })

  const chat = message.chat

  if (chat.type === 'private') {
    await sendMessage(chat.id, 'Add me to a group chat to start splitting expenses with your friends!')
  } else {
    await sendMessage(chat.id, `Splitwise for *${chat.title}*\nTrack and split expenses with your group!`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[{
          text: 'Open Splitwise 💰',
          web_app: { url: `${WEBAPP_URL}?chat_id=${chat.id}` },
        }]],
      },
    })
  }

  return NextResponse.json({ ok: true })
}
