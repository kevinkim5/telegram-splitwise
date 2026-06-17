import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getAuthUser } from '@/lib/auth'

export async function DELETE(request: Request, { params }: { params: { chatId: string; settlementId: string } }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows: [group] } = await sql`SELECT id FROM groups WHERE chat_id = ${params.chatId}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { rows: [existing] } = await sql`
    SELECT id FROM settlements WHERE id = ${parseInt(params.settlementId)} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!existing) return NextResponse.json({ error: 'Settlement not found' }, { status: 404 })

  await sql`UPDATE settlements SET deleted_at = NOW() WHERE id = ${parseInt(params.settlementId)}`
  return new Response(null, { status: 204 })
}
