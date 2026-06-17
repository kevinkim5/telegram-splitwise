import { NextResponse } from 'next/server'
import { ensureSchema } from '@/lib/db'

export async function POST(request: Request) {
  const token = request.headers.get('x-bot-token') ?? ''
  const botToken = process.env.BOT_TOKEN ?? ''
  if (botToken && token !== botToken) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  await ensureSchema()
  return NextResponse.json({ ok: true })
}
