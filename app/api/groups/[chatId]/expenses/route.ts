import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { computeEqualSplits } from '@/lib/splits'

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
  const { searchParams } = new URL(request.url)
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit = 30
  const offset = (page - 1) * limit

  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${BigInt(chatId)}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const [me] = await sql`SELECT id FROM members WHERE group_id = ${group.id} AND telegram_user_id = ${user.id}`
  const myMemberId = (me?.id as number) ?? 0

  const [{ count }] = await sql`
    SELECT COUNT(*) FROM expenses WHERE group_id = ${group.id} AND deleted_at IS NULL
  `
  const expenses = await sql`
    SELECT e.*,
           m.first_name || COALESCE(' ' || m.last_name, '') AS paid_by_name,
           es_me.amount AS my_split_amount
    FROM expenses e
    JOIN members m ON m.id = e.paid_by_member_id
    LEFT JOIN expense_splits es_me ON es_me.expense_id = e.id AND es_me.member_id = ${myMemberId}
    WHERE e.group_id = ${group.id} AND e.deleted_at IS NULL
    ORDER BY e.date DESC, e.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `

  return NextResponse.json({ total: parseInt(count as string), page, items: expenses })
}

export async function POST(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const [group] = await sql`SELECT id, currency FROM groups WHERE chat_id = ${BigInt(chatId)}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const [currentMember] = await sql`
    SELECT id FROM members WHERE group_id = ${group.id} AND telegram_user_id = ${user.id}
  `
  if (!currentMember) return NextResponse.json({ error: 'Member not found in group' }, { status: 403 })

  const body = await request.json()
  const { description, total_amount, currency, paid_by_member_id, split_type, splits, date, category } = body as {
    description: string
    total_amount: number
    currency?: string
    paid_by_member_id: number
    split_type: 'equal' | 'custom'
    splits: { member_id: number; amount?: number }[]
    date?: string
    category?: string
  }

  if (!description || !total_amount || !paid_by_member_id || !splits?.length) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
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

  const [expense] = await sql`
    INSERT INTO expenses (group_id, description, total_amount, currency, paid_by_member_id, split_type, created_by_member_id, date, category)
    VALUES (${group.id}, ${description}, ${total_amount}, ${currency ?? group.currency}, ${paid_by_member_id}, ${split_type}, ${currentMember.id}, ${expenseDate}, ${category ?? null})
    RETURNING id
  `

  for (const s of resolvedSplits) {
    await sql`
      INSERT INTO expense_splits (expense_id, member_id, amount)
      VALUES (${expense.id}, ${s.member_id}, ${s.amount})
    `
  }

  const result = await getExpenseWithSplits(expense.id as number)
  return NextResponse.json(result, { status: 201 })
}
