import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { validateGroupMembers } from '@/lib/validate-group-members'
import { parseChatId } from '@/lib/parse-params'
import { settlementBodySchema } from '@/lib/schemas'

export async function GET(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${chatIdBig}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const member = await getGroupMember(group.id as number, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const settlements = await sql`
    SELECT s.*,
           fm.first_name || COALESCE(' ' || fm.last_name, '') AS from_name,
           tm.first_name || COALESCE(' ' || tm.last_name, '') AS to_name
    FROM settlements s
    JOIN members fm ON fm.id = s.from_member_id
    JOIN members tm ON tm.id = s.to_member_id
    WHERE s.group_id = ${group.id} AND s.deleted_at IS NULL
    ORDER BY s.created_at DESC
  `
  return NextResponse.json(settlements)
}

export async function POST(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const parsed = settlementBodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 })
  }
  const { from_member_id, to_member_id, amount, currency } = parsed.data

  if (from_member_id === to_member_id) {
    return NextResponse.json({ error: 'from and to must differ' }, { status: 422 })
  }

  const [group] = await sql`SELECT id, currency FROM groups WHERE chat_id = ${chatIdBig}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const member = await getGroupMember(group.id as number, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  if (!await validateGroupMembers(group.id as number, [from_member_id, to_member_id])) {
    return NextResponse.json({ error: 'One or more member IDs do not belong to this group' }, { status: 422 })
  }

  const [settlement] = await sql`
    INSERT INTO settlements (group_id, from_member_id, to_member_id, amount, currency)
    VALUES (${group.id}, ${from_member_id}, ${to_member_id}, ${amount}, ${currency ?? group.currency})
    RETURNING id
  `

  const [result] = await sql`
    SELECT s.*,
           fm.first_name || COALESCE(' ' || fm.last_name, '') AS from_name,
           tm.first_name || COALESCE(' ' || tm.last_name, '') AS to_name
    FROM settlements s
    JOIN members fm ON fm.id = s.from_member_id
    JOIN members tm ON tm.id = s.to_member_id
    WHERE s.id = ${settlement.id}
  `
  return NextResponse.json(result, { status: 201 })
}
