import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { requireGroupMember } from '@/lib/group-access'
import { validateGroupMembers } from '@/lib/validate-group-members'
import { computeEqualSplits } from '@/lib/splits'
import { parseChatId } from '@/lib/parse-params'
import { expenseBodySchema } from '@/lib/schemas'
import { loadMemberNames } from '@/lib/expense-events'
import { escapeLike, parseFilterParams, parsePaging } from '@/lib/expense-filter'
import { createdSummary } from '@/lib/expense-history'

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
  const { page, limit, offset } = parsePaging(searchParams)

  const access = await requireGroupMember(chatIdBig, user.id)
  if (!access.ok) return access.response
  const group = access.group
  const me = access.member
  const myMemberId = me.id

  // Optional filters: text (description, category or who paid) and a date range on the expense's date
  const filters = parseFilterParams(searchParams)
  if (!filters.ok) return NextResponse.json({ error: filters.error }, { status: 422 })
  const pattern = filters.q ? `%${escapeLike(filters.q)}%` : null
  const filtered = !!(pattern || filters.from || filters.to)

  const expenses = await sql`
    SELECT e.*,
           m.first_name || COALESCE(' ' || m.last_name, '') AS paid_by_name,
           es_me.amount AS my_split_amount,
           COUNT(*) OVER() AS total_count
    FROM expenses e
    JOIN members m ON m.id = e.paid_by_member_id
    LEFT JOIN expense_splits es_me ON es_me.expense_id = e.id AND es_me.member_id = ${myMemberId}
    WHERE e.group_id = ${group.id} AND e.deleted_at IS NULL
      AND (${filters.from}::date IS NULL OR e.date >= ${filters.from}::date)
      AND (${filters.to}::date IS NULL OR e.date <= ${filters.to}::date)
      AND (${pattern}::text IS NULL
           OR e.description ILIKE ${pattern} ESCAPE '\\'
           OR e.category ILIKE ${pattern} ESCAPE '\\'
           OR (m.first_name || COALESCE(' ' || m.last_name, '')) ILIKE ${pattern} ESCAPE '\\')
    ORDER BY e.date DESC, e.created_at DESC, e.id DESC
    LIMIT ${limit} OFFSET ${offset}
  `
  const total = expenses.length > 0 ? parseInt(expenses[0].total_count as string) : 0

  const items = expenses.map(({ receipt_key, ...rest }) => ({ ...rest, has_receipt: !!receipt_key }))

  // Spend per currency over everything the filters match (all pages), so the screen can show
  // "N expenses · ≈ SGD x" for the filtered set
  const summary = filtered
    ? await sql`
        SELECT e.currency, SUM(e.total_amount)::float AS total, COUNT(*)::int AS count
        FROM expenses e
        JOIN members m ON m.id = e.paid_by_member_id
        WHERE e.group_id = ${group.id} AND e.deleted_at IS NULL
          AND (${filters.from}::date IS NULL OR e.date >= ${filters.from}::date)
          AND (${filters.to}::date IS NULL OR e.date <= ${filters.to}::date)
          AND (${pattern}::text IS NULL
               OR e.description ILIKE ${pattern} ESCAPE '\\'
               OR e.category ILIKE ${pattern} ESCAPE '\\'
               OR (m.first_name || COALESCE(' ' || m.last_name, '')) ILIKE ${pattern} ESCAPE '\\')
        GROUP BY e.currency
        ORDER BY SUM(e.total_amount) DESC
      `
    : null

  return NextResponse.json({ total, page, items, summary })
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

  const access = await requireGroupMember(chatIdBig, user.id)
  if (!access.ok) return access.response
  const group = access.group
  const currentMember = access.member

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

  const names = await loadMemberNames(group.id as number)
  const summary = createdSummary({
    description, total_amount, currency: currency ?? (group.currency as string),
    paid_by_member_id, paid_by_name: names.get(paid_by_member_id) ?? 'Someone',
    split_type, date: expenseDate, category: category ?? null,
    splits: resolvedSplits.map(r => ({ member_id: r.member_id, member_name: names.get(r.member_id) ?? '', amount: r.amount })),
  })

  // Single atomic query: insert expense + all splits + its "created" activity entry via writable CTE
  const [{ id: expenseId }] = await sql`
    WITH new_exp AS (
      INSERT INTO expenses (group_id, description, total_amount, currency, paid_by_member_id, split_type, created_by_member_id, date, category)
      VALUES (${group.id}, ${description}, ${total_amount}, ${currency ?? group.currency}, ${paid_by_member_id}, ${split_type}, ${currentMember.id}, ${expenseDate}, ${category ?? null})
      RETURNING id
    ), _splits AS (
      INSERT INTO expense_splits (expense_id, member_id, amount)
      SELECT new_exp.id, t.m, t.a
      FROM new_exp, unnest(${memberIds}::int[], ${amounts}::numeric[]) AS t(m, a)
    ), _event AS (
      INSERT INTO expense_events (expense_id, member_id, type, summary)
      SELECT new_exp.id, ${currentMember.id}, 'created', ${summary} FROM new_exp
    )
    SELECT id FROM new_exp
  `

  const { receipt_key: _unused, ...result } = await getExpenseWithSplits(expenseId as number) as { receipt_key?: string | null }
  return NextResponse.json({ ...result, has_receipt: false }, { status: 201 })
}
