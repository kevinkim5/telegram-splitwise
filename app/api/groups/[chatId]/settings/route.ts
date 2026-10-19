import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { parseChatId } from '@/lib/parse-params'
import { settingsBodySchema } from '@/lib/schemas'

// The weekly reminder setting and who set it, for the settings sheet
async function loadReminder(groupId: number) {
  const [r] = await sql`
    SELECT g.reminder_day, m.first_name || COALESCE(' ' || m.last_name, '') AS set_by
    FROM groups g LEFT JOIN members m ON m.id = g.reminder_set_by
    WHERE g.id = ${groupId}
  `
  return {
    reminder_day: r?.reminder_day === null || r?.reminder_day === undefined ? null : Number(r.reminder_day),
    reminder_set_by: (r?.set_by as string | null) ?? null,
  }
}

export async function GET(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const [group] = await sql`SELECT id, title, currency FROM groups WHERE chat_id = ${chatIdBig} AND deleted_at IS NULL`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const member = await getGroupMember(group.id as number, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ currency: group.currency, title: group.title, ...(await loadReminder(group.id as number)) })
}

export async function PUT(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${chatIdBig} AND deleted_at IS NULL`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const member = await getGroupMember(group.id as number, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const parsed = settingsBodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 })
  }

  if (parsed.data.currency !== undefined) {
    await sql`UPDATE groups SET currency = ${parsed.data.currency} WHERE id = ${group.id}`
  }
  if (parsed.data.reminder_day !== undefined) {
    // turning it off clears who set it; turning it on (or moving it) records who did
    const day = parsed.data.reminder_day
    await sql`
      UPDATE groups SET reminder_day = ${day}, reminder_set_by = ${day === null ? null : member.id}
      WHERE id = ${group.id}
    `
  }

  const [updated] = await sql`SELECT id, title, currency FROM groups WHERE id = ${group.id}`
  return NextResponse.json({ currency: updated.currency, title: updated.title, ...(await loadReminder(group.id as number)) })
}
