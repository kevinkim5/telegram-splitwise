import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { parseChatId } from '@/lib/parse-params'
import { restoreMember } from '@/lib/member-store'

// Add a removed member back. Any current member can do it (the same people who can remove someone), so
// a mistaken removal is undone in one tap. Everything of theirs comes back as it was.
export async function POST(request: Request, props: { params: Promise<{ chatId: string; memberId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId, memberId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })
  const targetId = /^\d+$/.test(memberId) ? parseInt(memberId, 10) : NaN
  if (!Number.isSafeInteger(targetId) || targetId <= 0) return NextResponse.json({ error: 'Invalid member ID' }, { status: 400 })

  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${chatIdBig} AND deleted_at IS NULL`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const caller = await getGroupMember(group.id as number, user.id)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!await restoreMember(group.id as number, targetId)) return NextResponse.json({ error: 'That member is not removed' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
