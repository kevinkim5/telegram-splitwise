import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'

async function formatSettlement(id: number) {
  const { rows: [s] } = await sql`SELECT * FROM settlements WHERE id = ${id}`
  const { rows: [from] } = await sql`SELECT id, first_name, last_name, username FROM members WHERE id = ${s.from_member}`
  const { rows: [to] } = await sql`SELECT id, first_name, last_name, username FROM members WHERE id = ${s.to_member}`
  return { ...s, from_member: from, to_member: to }
}

export async function GET(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await props.params

  const { rows: [group] } = await sql`SELECT id FROM groups WHERE chat_id = ${params.chatId}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { rows } = await sql`
    SELECT id FROM settlements WHERE group_id = ${group.id} AND deleted_at IS NULL ORDER BY settled_at DESC
  `
  const result = await Promise.all(rows.map(r => formatSettlement(r.id as number)))
  return NextResponse.json(result)
}

export async function POST(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const params = await props.params

  const { rows: [group] } = await sql`SELECT id FROM groups WHERE chat_id = ${params.chatId}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { from_member_id, to_member_id, amount, currency, note } = await request.json()

  if (amount <= 0) return NextResponse.json({ error: 'amount must be positive' }, { status: 422 })
  if (from_member_id === to_member_id) return NextResponse.json({ error: 'from and to must differ' }, { status: 422 })

  const { rows: [s] } = await sql`
    INSERT INTO settlements (group_id, from_member, to_member, amount, currency, note)
    VALUES (${group.id}, ${from_member_id}, ${to_member_id}, ${amount}, ${currency}, ${note ?? null})
    RETURNING id
  `
  return NextResponse.json(await formatSettlement(s.id as number), { status: 201 })
}
