import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getAuthUser } from '@/lib/auth'

export async function POST(request: Request) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chat_id, title } = await request.json()

  const { rows: [group] } = await sql`
    INSERT INTO groups (chat_id, title) VALUES (${chat_id}, ${title ?? null})
    ON CONFLICT (chat_id) DO UPDATE SET title = EXCLUDED.title
    RETURNING id, chat_id, title, created_at
  `

  const { rows: [member] } = await sql`
    INSERT INTO members (group_id, telegram_user_id, first_name, last_name, username)
    VALUES (${group.id}, ${String(user.id)}, ${user.first_name as string}, ${(user.last_name ?? null) as string | null}, ${(user.username ?? null) as string | null})
    ON CONFLICT (group_id, telegram_user_id) DO UPDATE SET
      first_name = EXCLUDED.first_name,
      last_name  = EXCLUDED.last_name,
      username   = EXCLUDED.username
    RETURNING id, group_id, telegram_user_id, first_name, last_name, username
  `

  return NextResponse.json({ group, member })
}
