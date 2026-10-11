import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { requireGroupMember } from '@/lib/group-access'
import { parseChatId } from '@/lib/parse-params'
import { settingsBodySchema } from '@/lib/schemas'

export async function GET(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const access = await requireGroupMember(chatIdBig, user.id)
  if (!access.ok) return access.response
  const group = access.group
  const member = access.member

  return NextResponse.json({ currency: group.currency, title: group.title })
}

export async function PUT(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const access = await requireGroupMember(chatIdBig, user.id)
  if (!access.ok) return access.response
  const group = access.group
  const member = access.member

  const parsed = settingsBodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 })
  }

  await sql`UPDATE groups SET currency = ${parsed.data.currency} WHERE id = ${group.id}`

  const [updated] = await sql`SELECT id, title, currency FROM groups WHERE id = ${group.id}`
  return NextResponse.json({ currency: updated.currency, title: updated.title })
}
