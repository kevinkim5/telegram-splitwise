import { NextResponse } from 'next/server'
import { getAuthUser } from '@/lib/auth'
import { requireGroupMember } from '@/lib/group-access'
import { postGroupBalances } from '@/lib/notify-group'
import { parseChatId } from '@/lib/parse-params'

export async function POST(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const access = await requireGroupMember(chatIdBig, user.id)
  if (!access.ok) return access.response

  const result = await postGroupBalances(access.group, chatId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({ ok: true })
}
