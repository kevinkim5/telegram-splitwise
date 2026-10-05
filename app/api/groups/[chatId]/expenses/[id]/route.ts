import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { validateGroupMembers } from '@/lib/validate-group-members'
import { computeEqualSplits } from '@/lib/splits'
import { parseChatId, parseResourceId } from '@/lib/parse-params'
import { expenseBodySchema } from '@/lib/schemas'
import { signedGetUrl } from '@/lib/r2'

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

// Replace the internal storage key with has_receipt plus a short-lived signed view URL.
async function withReceipt(expense: object) {
  const { receipt_key, ...rest } = expense as { receipt_key?: string | null }
  const receipt_url = receipt_key ? await signedGetUrl(receipt_key).catch(() => null) : null
  return { ...rest, has_receipt: !!receipt_key, receipt_url }
}

export async function GET(
  request: Request,
  props: { params: Promise<{ chatId: string; id: string }> }
) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId, id } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })
  const expenseId = parseResourceId(id)
  if (!expenseId) return NextResponse.json({ error: 'Invalid expense ID' }, { status: 400 })

  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${chatIdBig} AND deleted_at IS NULL`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const member = await getGroupMember(group.id as number, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const expense = await getExpenseWithSplits(expenseId)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  if (!expense || (expense as any).group_id !== group.id) {
    return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
  }

  return NextResponse.json(await withReceipt(expense))
}

export async function PUT(
  request: Request,
  props: { params: Promise<{ chatId: string; id: string }> }
) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId, id } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })
  const expenseId = parseResourceId(id)
  if (!expenseId) return NextResponse.json({ error: 'Invalid expense ID' }, { status: 400 })

  const parsed = expenseBodySchema.safeParse(await request.json())
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 422 })
  }
  const { description, total_amount, currency, paid_by_member_id, split_type, splits, date, category } = parsed.data

  const [group] = await sql`SELECT id, currency FROM groups WHERE chat_id = ${chatIdBig} AND deleted_at IS NULL`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const member = await getGroupMember(group.id as number, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [existing] = await sql`
    SELECT * FROM expenses WHERE id = ${expenseId} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })

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

  const expenseDate = date ?? (existing.date as string)

  const memberIds = resolvedSplits.map(s => s.member_id)
  const amounts = resolvedSplits.map(s => s.amount)

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
        WHERE id = ${expenseId}`,
    sql`DELETE FROM expense_splits WHERE expense_id = ${expenseId}`,
    sql`INSERT INTO expense_splits (expense_id, member_id, amount)
        SELECT ${expenseId}, t.m, t.a
        FROM unnest(${memberIds}::int[], ${amounts}::numeric[]) AS t(m, a)`,
  ])

  const result = await getExpenseWithSplits(expenseId)
  return NextResponse.json(result ? await withReceipt(result) : result)
}

export async function DELETE(
  request: Request,
  props: { params: Promise<{ chatId: string; id: string }> }
) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId, id } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })
  const expenseId = parseResourceId(id)
  if (!expenseId) return NextResponse.json({ error: 'Invalid expense ID' }, { status: 400 })

  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${chatIdBig} AND deleted_at IS NULL`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const member = await getGroupMember(group.id as number, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const [existing] = await sql`
    SELECT id FROM expenses WHERE id = ${expenseId} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!existing) return NextResponse.json({ error: 'Expense not found' }, { status: 404 })

  await sql`UPDATE expenses SET deleted_at = NOW() WHERE id = ${expenseId}`
  return NextResponse.json({ ok: true })
}
