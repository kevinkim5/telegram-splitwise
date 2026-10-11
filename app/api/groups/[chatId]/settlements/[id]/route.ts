import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { requireGroupMember } from '@/lib/group-access'
import { parseChatId, parseResourceId } from '@/lib/parse-params'
import { settlementBodySchema } from '@/lib/schemas'

export async function PUT(
  request: Request,
  props: { params: Promise<{ chatId: string; id: string }> }
) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId, id } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })
  const settlementId = parseResourceId(id)
  if (!settlementId) return NextResponse.json({ error: 'Invalid settlement ID' }, { status: 400 })

  const parsed = settlementBodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 })
  }
  const { from_member_id, to_member_id, amount, currency } = parsed.data

  if (from_member_id === to_member_id) {
    return NextResponse.json({ error: 'from and to must differ' }, { status: 400 })
  }

  const access = await requireGroupMember(chatIdBig, user.id)
  if (!access.ok) return access.response
  const group = access.group
  const member = access.member

  const [existing] = await sql`
    SELECT id FROM settlements
    WHERE id = ${settlementId} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!existing) return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })

  const [fromMember] = await sql`SELECT id FROM members WHERE id = ${from_member_id} AND group_id = ${group.id}`
  const [toMember] = await sql`SELECT id FROM members WHERE id = ${to_member_id} AND group_id = ${group.id}`
  if (!fromMember || !toMember) {
    return NextResponse.json({ error: 'Invalid members' }, { status: 400 })
  }

  await sql`
    UPDATE settlements
    SET from_member_id = ${from_member_id},
        to_member_id   = ${to_member_id},
        amount         = ${amount},
        currency       = ${(currency ?? '').trim().toUpperCase()}
    WHERE id = ${settlementId}
  `

  const [updated] = await sql`
    SELECT s.*,
           fm.first_name || COALESCE(' ' || fm.last_name, '') AS from_name,
           tm.first_name || COALESCE(' ' || tm.last_name, '') AS to_name
    FROM settlements s
    JOIN members fm ON fm.id = s.from_member_id
    JOIN members tm ON tm.id = s.to_member_id
    WHERE s.id = ${settlementId}
  `
  return NextResponse.json(updated)
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ chatId: string; id: string }> }
) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId, id } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })
  const settlementId = parseResourceId(id)
  if (!settlementId) return NextResponse.json({ error: 'Invalid settlement ID' }, { status: 400 })

  const access = await requireGroupMember(chatIdBig, user.id)
  if (!access.ok) return access.response
  const group = access.group
  const member = access.member

  const [existing] = await sql`
    SELECT id FROM settlements
    WHERE id = ${settlementId} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!existing) return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })

  await sql`UPDATE settlements SET deleted_at = NOW() WHERE id = ${settlementId}`
  return NextResponse.json({ ok: true })
}
