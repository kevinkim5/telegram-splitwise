import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'

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
