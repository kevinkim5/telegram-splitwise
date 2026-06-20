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

  const [group] = await sql`SELECT id, currency FROM groups WHERE chat_id = ${chatIdBig}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const me = await getGroupMember(group.id as number, user.id)
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const myMemberId = me.id

  const summary = await sql`
    SELECT
      e.currency,
      SUM(e.total_amount)::float       AS group_total,
      COALESCE(SUM(es_me.amount), 0)::float AS my_total,
      COUNT(*)::int                    AS count
    FROM expenses e
    LEFT JOIN expense_splits es_me
      ON es_me.expense_id = e.id AND es_me.member_id = ${myMemberId}
    WHERE e.group_id = ${group.id} AND e.deleted_at IS NULL
    GROUP BY e.currency
    ORDER BY SUM(e.total_amount) DESC
  `

  const byCategory = await sql`
    SELECT
      e.currency,
      e.category,
      SUM(e.total_amount)::float       AS group_total,
      COALESCE(SUM(es_me.amount), 0)::float AS my_total,
      COUNT(*)::int                    AS count
    FROM expenses e
    LEFT JOIN expense_splits es_me
      ON es_me.expense_id = e.id AND es_me.member_id = ${myMemberId}
    WHERE e.group_id = ${group.id} AND e.deleted_at IS NULL
    GROUP BY e.currency, e.category
    ORDER BY e.currency, SUM(e.total_amount) DESC
  `

  return NextResponse.json({
    group_currency: group.currency as string,
    summary,
    by_category: byCategory,
  })
}
