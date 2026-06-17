import { NextResponse } from 'next/server'
import { sql } from '@vercel/postgres'
import { getAuthUser } from '@/lib/auth'

async function formatExpense(expenseId: number) {
  const { rows: [exp] } = await sql`SELECT * FROM expenses WHERE id = ${expenseId}`
  const { rows: [paidBy] } = await sql`SELECT id, first_name, last_name, username FROM members WHERE id = ${exp.paid_by}`
  const { rows: splits } = await sql`
    SELECT es.member_id, es.amount, m.first_name, m.last_name, m.username
    FROM expense_splits es JOIN members m ON m.id = es.member_id
    WHERE es.expense_id = ${expenseId} ORDER BY m.first_name
  `
  return { ...exp, paid_by: paidBy, splits }
}

type Params = { params: { chatId: string; expenseId: string } }

export async function GET(request: Request, { params }: Params) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows: [group] } = await sql`SELECT id FROM groups WHERE chat_id = ${params.chatId}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const { rows: [expense] } = await sql`
    SELECT id FROM expenses WHERE id = ${parseInt(params.expenseId)} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })

  return NextResponse.json(await formatExpense(expense.id))
}

export async function PUT(request: Request, { params }: Params) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows: [group] } = await sql`SELECT id FROM groups WHERE chat_id = ${params.chatId}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const expenseId = parseInt(params.expenseId)
  const { rows: [existing] } = await sql`
    SELECT id FROM expenses WHERE id = ${expenseId} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })

  const body = await request.json()
  const { description, total_amount, currency, paid_by_member_id, split_type, splits } = body

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

  await sql`
    UPDATE expenses SET
      description = ${description}, total_amount = ${total_amount},
      currency = ${currency}, paid_by = ${paid_by_member_id},
      split_type = ${split_type}, updated_at = NOW()
    WHERE id = ${expenseId}
  `
  await sql`DELETE FROM expense_splits WHERE expense_id = ${expenseId}`
  for (const s of resolvedSplits) {
    await sql`INSERT INTO expense_splits (expense_id, member_id, amount) VALUES (${expenseId}, ${s.member_id}, ${s.amount})`
  }

  return NextResponse.json(await formatExpense(expenseId))
}

export async function DELETE(request: Request, { params }: Params) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { rows: [group] } = await sql`SELECT id FROM groups WHERE chat_id = ${params.chatId}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const expenseId = parseInt(params.expenseId)
  const { rows: [existing] } = await sql`
    SELECT id FROM expenses WHERE id = ${expenseId} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })

  await sql`UPDATE expenses SET deleted_at = NOW() WHERE id = ${expenseId}`
  return new Response(null, { status: 204 })
}
