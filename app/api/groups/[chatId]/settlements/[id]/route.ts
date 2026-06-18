import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'

export async function PUT(
  request: Request,
  props: { params: Promise<{ chatId: string; id: string }> }
) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId, id } = await props.params
  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${BigInt(chatId)}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const [existing] = await sql`
    SELECT id FROM settlements
    WHERE id = ${parseInt(id)} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!existing) return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })

  const body = await request.json()
  const { from_member_id, to_member_id, amount, currency } = body as {
    from_member_id: number
    to_member_id: number
    amount: number
    currency: string
  }

  if (!from_member_id || !to_member_id || !amount || from_member_id === to_member_id) {
    return NextResponse.json({ error: 'Invalid fields' }, { status: 400 })
  }
  if (amount <= 0) return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 })

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
        currency       = ${currency.trim().toUpperCase()}
    WHERE id = ${parseInt(id)}
  `

  const [updated] = await sql`
    SELECT s.*,
           fm.first_name || COALESCE(' ' || fm.last_name, '') AS from_name,
           tm.first_name || COALESCE(' ' || tm.last_name, '') AS to_name
    FROM settlements s
    JOIN members fm ON fm.id = s.from_member_id
    JOIN members tm ON tm.id = s.to_member_id
    WHERE s.id = ${parseInt(id)}
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
  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${BigInt(chatId)}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const [existing] = await sql`
    SELECT id FROM settlements
    WHERE id = ${parseInt(id)} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!existing) return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })

  await sql`UPDATE settlements SET deleted_at = NOW() WHERE id = ${parseInt(id)}`
  return NextResponse.json({ ok: true })
}
