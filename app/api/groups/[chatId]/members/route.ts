import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'

export async function GET(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await props.params

  const { rows: [group] } = await sql`SELECT id FROM groups WHERE chat_id = ${params.chatId}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { rows } = await sql`
    SELECT id, telegram_user_id, first_name, last_name, username
    FROM members WHERE group_id = ${group.id} ORDER BY first_name
  `
  return NextResponse.json(rows)
}
