import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { requireGroupMember } from '@/lib/group-access'
import { loadLedger } from '@/lib/group-balances'
import { parseChatId } from '@/lib/parse-params'

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

  // balances: one line per member, all currencies added together (for the header); balances_by_currency
  // and simplified_debts: the per-currency picture the Balances tab shows
  const { balances, balances_by_currency, simplified_debts } = await loadLedger(group.id as number, group.currency as string)
  return NextResponse.json({ balances, balances_by_currency, simplified_debts })
}
