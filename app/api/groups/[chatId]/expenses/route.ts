import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { validateGroupMembers } from '@/lib/validate-group-members'
import { computeEqualSplits } from '@/lib/splits'
import { parseChatId } from '@/lib/parse-params'
import { expenseBodySchema } from '@/lib/schemas'

async function getExpenseWithSplits(expenseId: number) {
  const [exp] = await sql`
    SELECT e.*, m.first_name || COALESCE(' ' || m.last_name, '') AS paid_by_name
    FROM expenses e
    JOIN members m ON m.id = e.paid_by_member_id
    WHERE e.id = ${expenseId}
  `
  const splits = await sql`
    SELECT es.id, es.expense_id, es.member_id, es.amount,
           m.first_name || COALESCE(' ' || m.last_name, '') AS member_name
    FROM expense_splits es
    JOIN members m ON m.id = es.member_id
    WHERE es.expense_id = ${expenseId}
    ORDER BY m.first_name
  `
  return { ...exp, splits }
}

export async function GET(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 30
  const offset = (page - 1) * limit

  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${chatIdBig} AND deleted_at IS NULL`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const me = await getGroupMember(group.id as number, user.id)
  if (!me) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const myMemberId = me.id

  const expenses = await sql`
    SELECT e.*,
           m.first_name || COALESCE(' ' || m.last_name, '') AS paid_by_name,
           es_me.amount AS my_split_amount,
           COUNT(*) OVER() AS total_count
    FROM expenses e
    JOIN members m ON m.id = e.paid_by_member_id
    LEFT JOIN expense_splits es_me ON es_me.expense_id = e.id AND es_me.member_id = ${myMemberId}
    WHERE e.group_id = ${group.id} AND e.deleted_at IS NULL
    ORDER BY e.date DESC, e.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `
  const total = expenses.length > 0 ? parseInt(expenses[0].total_count as string) : 0

  const items = expenses.map(({ receipt_key, ...rest }) => ({ ...rest, has_receipt: !!receipt_key }))

  return NextResponse.json({ total, page, items })
}

export async function POST(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  const parsed = expenseBodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 })
  }
  const { description, total_amount, currency, paid_by_member_id, split_type, splits, date, category } = parsed.data

  const [group] = await sql`SELECT id, currency FROM groups WHERE chat_id = ${chatIdBig} AND deleted_at IS NULL`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const currentMember = await getGroupMember(group.id as number, user.id)
  if (!currentMember) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const allMemberIds = [paid_by_member_id, ...splits.map(s => s.member_id)]
  if (!await validateGroupMembers(group.id as number, allMemberIds)) {
    return NextResponse.json({ error: 'One or more member IDs do not belong to this group' }, { status: 422 })
  }

  let resolvedSplits: { member_id: number; amount: number }[]

  if (split_type === 'equal') {
    resolvedSplits = computeEqualSplits(total_amount, splits.map(s => s.member_id))
  } else {
    const sum = splits.reduce((a, s) => a + (s.amount ?? 0), 0)
    if (Math.abs(sum - total_amount) > 0.02) {
      return NextResponse.json(
        { error: `Custom split amounts (${sum.toFixed(2)}) must equal total (${total_amount.toFixed(2)})` },
        { status: 422 }
      )
    }
    resolvedSplits = splits.map(s => ({ member_id: s.member_id, amount: s.amount! }))
  }

  const expenseDate = date ?? new Date().toISOString().split('T')[0]

  const memberIds = resolvedSplits.map(s => s.member_id)
  const amounts = resolvedSplits.map(s => s.amount)

  // Single atomic query: insert expense + all splits via writable CTE
  const [{ id: expenseId }] = await sql`
    WITH new_exp AS (
      INSERT INTO expenses (group_id, description, total_amount, currency, paid_by_member_id, split_type, created_by_member_id, date, category)
      VALUES (${group.id}, ${description}, ${total_amount}, ${currency ?? group.currency}, ${paid_by_member_id}, ${split_type}, ${currentMember.id}, ${expenseDate}, ${category ?? null})
      RETURNING id
    ), _splits AS (
      INSERT INTO expense_splits (expense_id, member_id, amount)
      SELECT new_exp.id, t.m, t.a
      FROM new_exp, unnest(${memberIds}::int[], ${amounts}::numeric[]) AS t(m, a)
    )
    SELECT id FROM new_exp
  `

  const { receipt_key: _unused, ...result } = await getExpenseWithSplits(expenseId as number) as { receipt_key?: string | null }
  return NextResponse.json({ ...result, has_receipt: false }, { status: 201 })
}
