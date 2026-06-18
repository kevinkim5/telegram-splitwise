import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'

export async function GET(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${BigInt(chatId)}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

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
  const [group] = await sql`SELECT id, currency FROM groups WHERE chat_id = ${BigInt(chatId)}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { from_member_id, to_member_id, amount } = await request.json() as {
    from_member_id: number
    to_member_id: number
    amount: number
  }

  if (!from_member_id || !to_member_id || !amount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (amount <= 0) return NextResponse.json({ error: 'amount must be positive' }, { status: 422 })
  if (from_member_id === to_member_id) {
    return NextResponse.json({ error: 'from and to must differ' }, { status: 422 })
  }

  const [settlement] = await sql`
    INSERT INTO settlements (group_id, from_member_id, to_member_id, amount, currency)
    VALUES (${group.id}, ${from_member_id}, ${to_member_id}, ${amount}, ${group.currency})
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
