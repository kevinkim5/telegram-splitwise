import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { requireGroupMember } from '@/lib/group-access'
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
  const me = access.member
  const myMemberId = me.id

  // both figures in one round trip, read from the same snapshot
  const [summary, byCategory] = await sql.transaction([
    sql`
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
  `,
    sql`
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
  `,
  ], { isolationLevel: 'RepeatableRead', readOnly: true })

  return NextResponse.json({
    group_currency: group.currency as string,
    summary,
    by_category: byCategory,
  })
}
