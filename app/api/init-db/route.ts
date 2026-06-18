import { NextResponse } from 'next/server'
import { ensureSchema } from '@/lib/db'

export async function GET() {
  try {
    await ensureSchema()
    return NextResponse.json({ ok: true, message: 'Schema initialized successfully' })
  } catch (err) {
    console.error('init-db error:', err)
    return NextResponse.json({ ok: false, error: String(err) }, { status: 500 })
  }
}
