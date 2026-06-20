import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { parseChatId } from '@/lib/parse-params'

export async function GET(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const [group] = await sql`SELECT id, title, currency FROM groups WHERE chat_id = ${chatIdBig}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const member = await getGroupMember(group.id as number, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  return NextResponse.json({ currency: group.currency, title: group.title })
}

export async function PUT(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${chatIdBig}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const member = await getGroupMember(group.id as number, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { currency } = await request.json() as { currency: string }
  if (!currency) return NextResponse.json({ error: 'currency is required' }, { status: 400 })

  await sql`UPDATE groups SET currency = ${currency.toUpperCase()} WHERE id = ${group.id}`

  const [updated] = await sql`SELECT id, title, currency FROM groups WHERE id = ${group.id}`
  return NextResponse.json({ currency: updated.currency, title: updated.title })
}
