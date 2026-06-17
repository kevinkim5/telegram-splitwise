import { NextResponse } from 'next/server'

const BOT_TOKEN = process.env.BOT_TOKEN ?? ''
const WEBAPP_URL = process.env.WEBAPP_URL ?? ''

export async function POST(request: Request) {
  const token = request.headers.get('x-bot-token') ?? ''
  if (!BOT_TOKEN || token !== BOT_TOKEN) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const webhookUrl = `${WEBAPP_URL}/api/bot/webhook/${BOT_TOKEN}`
  const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: webhookUrl }),
  })
  const data = await res.json()
  return NextResponse.json({ ok: data.ok, webhook_url: webhookUrl })
}
