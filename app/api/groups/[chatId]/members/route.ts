import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { requireGroupMember } from '@/lib/group-access'
import { parseChatId } from '@/lib/parse-params'

export async function GET(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const access = await requireGroupMember(chatIdBig, user.id)
  if (!access.ok) return access.response
  const group = access.group
  const member = access.member

  const members = await sql`
    SELECT id, group_id, telegram_user_id, first_name, last_name, username, photo_url, created_at, removed_at
    FROM members
    WHERE group_id = ${group.id}
    ORDER BY first_name
  `
  // Everyone, removed members included (flagged by removed_at): the app needs their names for past
  // expenses and unsettled balances, and shows only the active ones in pickers and the header
  return NextResponse.json(members)
}
