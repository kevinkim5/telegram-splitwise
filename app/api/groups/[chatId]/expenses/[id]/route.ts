import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { computeEqualSplits } from '@/lib/splits'

async function getExpenseWithSplits(expenseId: number) {
  const [exp] = await sql`
    SELECT e.*, m.first_name || COALESCE(' ' || m.last_name, '') AS paid_by_name
    FROM expenses e
    JOIN members m ON m.id = e.paid_by_member_id
    WHERE e.id = ${expenseId} AND e.deleted_at IS NULL
  `
  if (!exp) return null
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

export async function GET(
  request: Request,
  props: { params: Promise<{ chatId: string; id: string }> }
) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId, id } = await props.params
  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${BigInt(chatId)}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const expense = await getExpenseWithSplits(parseInt(id))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!expense || (expense as any).group_id !== group.id) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }

  return NextResponse.json(expense)
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ chatId: string; id: string }> }
) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId, id } = await props.params
  const [group] = await sql`SELECT id, currency FROM groups WHERE chat_id = ${BigInt(chatId)}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const [existing] = await sql`
    SELECT * FROM expenses WHERE id = ${parseInt(id)} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })

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

  const expenseDate = date ?? (existing.date as string)

  const memberIds = resolvedSplits.map(s => s.member_id)
  const amounts = resolvedSplits.map(s => s.amount)
  const expId = parseInt(id)

  // Atomic: update expense + replace all splits in one transaction (single HTTP round trip to Neon)
  await sql.transaction([
    sql`UPDATE expenses
        SET description = ${description},
            total_amount = ${total_amount},
            currency = ${currency ?? (existing.currency as string)},
            paid_by_member_id = ${paid_by_member_id},
            split_type = ${split_type},
            date = ${expenseDate},
            category = ${category ?? null}
        WHERE id = ${expId}`,
    sql`DELETE FROM expense_splits WHERE expense_id = ${expId}`,
    sql`INSERT INTO expense_splits (expense_id, member_id, amount)
        SELECT ${expId}, t.m, t.a
        FROM unnest(${memberIds}::int[], ${amounts}::numeric[]) AS t(m, a)`,
  ])

  const result = await getExpenseWithSplits(parseInt(id))
  return NextResponse.json(result)
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ chatId: string; id: string }> }
) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId, id } = await props.params
  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${BigInt(chatId)}`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const [existing] = await sql`
    SELECT id FROM expenses WHERE id = ${parseInt(id)} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })

  await sql`UPDATE expenses SET deleted_at = NOW() WHERE id = ${parseInt(id)}`
  return NextResponse.json({ ok: true })
}
