import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getAuthUser } from '@/lib/auth'

async function formatExpense(expenseId: number) {
  const { rows: [exp] } = await sql`SELECT * FROM expenses WHERE id = ${expenseId}`
  const { rows: [paidBy] } = await sql`
    SELECT id, first_name, last_name, username FROM members WHERE id = ${exp.paid_by}
  `
  const { rows: splits } = await sql`
    SELECT es.member_id, es.amount, m.first_name, m.last_name, m.username
    FROM expense_splits es JOIN members m ON m.id = es.member_id
    WHERE es.expense_id = ${expenseId} ORDER BY m.first_name
  `
  return { ...exp, paid_by: paidBy, splits }
}

export async function GET(request: Request, { params }: { params: { chatId: string } }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') ?? '1')
  const limit = 30
  const offset = (page - 1) * limit

  const { rows: [group] } = await sql`SELECT id FROM groups WHERE chat_id = ${params.chatId}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { rows: [{ count }] } = await sql`
    SELECT COUNT(*) FROM expenses WHERE group_id = ${group.id} AND deleted_at IS NULL
  `
  const { rows: expenses } = await sql`
    SELECT * FROM expenses WHERE group_id = ${group.id} AND deleted_at IS NULL
    ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}
  `

  const items = await Promise.all(expenses.map(e => formatExpense(e.id)))
  return NextResponse.json({ total: parseInt(count), page, items })
}

export async function POST(request: Request, { params }: { params: { chatId: string } }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows: [group] } = await sql`SELECT id FROM groups WHERE chat_id = ${params.chatId}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const body = await request.json()
  const { description, total_amount, currency, paid_by_member_id, split_type, splits } = body

  if (!splits?.length) return NextResponse.json({ error: 'splits required' }, { status: 422 })

  let resolvedSplits: { member_id: number; amount: number }[]
  if (split_type === 'equal') {
    const share = total_amount / splits.length
    resolvedSplits = splits.map((s: { member_id: number }) => ({ member_id: s.member_id, amount: share }))
  } else {
    const sum = splits.reduce((a: number, s: { amount: number }) => a + s.amount, 0)
    if (Math.abs(sum - total_amount) > 0.01) {
      return NextResponse.json({ error: `Split amounts sum to ${sum}, expected ${total_amount}` }, { status: 422 })
    }
    resolvedSplits = splits
  }

  const { rows: [expense] } = await sql`
    INSERT INTO expenses (group_id, description, total_amount, currency, paid_by, split_type)
    VALUES (${group.id}, ${description}, ${total_amount}, ${currency}, ${paid_by_member_id}, ${split_type})
    RETURNING id
  `

  for (const s of resolvedSplits) {
    await sql`
      INSERT INTO expense_splits (expense_id, member_id, amount)
      VALUES (${expense.id}, ${s.member_id}, ${s.amount})
    `
  }

  return NextResponse.json(await formatExpense(expense.id), { status: 201 })
}
