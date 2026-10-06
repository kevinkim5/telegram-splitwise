import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { parseChatId, parseResourceId } from '@/lib/parse-params'
import { readReceiptImage, receiptExtension } from '@/lib/receipt-image'
import { logReceiptChange } from '@/lib/expense-events'
import {
  deleteReceipt, putReceipt, readReceipt, receiptKey, receiptViewUrl, storageConfigured, verifyReceiptLink,
} from '@/lib/receipt-storage'

type Props = { params: Promise<{ chatId: string; id: string }> }

async function resolveExpense(request: Request, props: Props) {
  const user = getAuthUser(request)
  if (!user) return { ok: false as const, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }

  const { chatId, id } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return { ok: false as const, response: NextResponse.json({ error: 'Invalid group ID' }, { status: 400 }) }
  const expenseId = parseResourceId(id)
  if (!expenseId) return { ok: false as const, response: NextResponse.json({ error: 'Invalid expense ID' }, { status: 400 }) }

  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${chatIdBig} AND deleted_at IS NULL`
  if (!group) return { ok: false as const, response: NextResponse.json({ error: 'Group not found' }, { status: 404 }) }

  const member = await getGroupMember(group.id as number, user.id)
  if (!member) return { ok: false as const, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }

  const [expense] = await sql`
    SELECT id, receipt_key FROM expenses
    WHERE id = ${expenseId} AND group_id = ${group.id} AND deleted_at IS NULL
  `
  if (!expense) return { ok: false as const, response: NextResponse.json({ error: 'Expense not found' }, { status: 404 }) }

  return { ok: true as const, groupId: group.id as number, memberId: member.id, chatId, expenseId, oldKey: (expense.receipt_key as string | null) ?? null }
}

// Stream the receipt image. Authorised by a short-lived signed link (see receiptViewUrl) instead
// of Telegram headers, because <img src> cannot send headers. Links are issued only to group members.
export async function GET(request: Request, props: Props) {
  const { chatId, id } = await props.params
  const chatIdBig = parseChatId(chatId)
  const expenseId = parseResourceId(id)
  if (!chatIdBig || !expenseId) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (!storageConfigured()) return NextResponse.json({ error: 'Receipt storage is not set up yet' }, { status: 503 })

  const [row] = await sql`
    SELECT e.receipt_key FROM expenses e
    JOIN groups g ON g.id = e.group_id
    WHERE e.id = ${expenseId} AND g.chat_id = ${chatIdBig}
      AND e.deleted_at IS NULL AND g.deleted_at IS NULL
  `
  const key = (row?.receipt_key as string | null) ?? null
  if (!key) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { searchParams } = new URL(request.url)
  if (!verifyReceiptLink(chatId, expenseId, key, searchParams.get('exp'), searchParams.get('sig'))) {
    return NextResponse.json({ error: 'Link expired or invalid' }, { status: 403 })
  }

  const file = await readReceipt(key)
  if (!file) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return new Response(file.stream, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, max-age=600',
      'X-Content-Type-Options': 'nosniff',
    },
  })
}

// Attach (or replace) the single receipt image for an expense.
export async function PUT(request: Request, props: Props) {
  const ctx = await resolveExpense(request, props)
  if (!ctx.ok) return ctx.response

  if (!storageConfigured()) {
    return NextResponse.json({ error: 'Receipt storage is not set up yet' }, { status: 503 })
  }

  const image = await readReceiptImage(request)
  if (!image.ok) return NextResponse.json({ error: image.error }, { status: image.status })

  const key = receiptKey(ctx.groupId, ctx.expenseId, receiptExtension(image.type))
  try {
    await putReceipt(key, image.bytes, image.type)
  } catch (err) {
    console.error('Receipt upload failed:', err)
    return NextResponse.json({ error: 'Could not upload the receipt. Try again.' }, { status: 502 })
  }

  try {
    await sql`UPDATE expenses SET receipt_key = ${key} WHERE id = ${ctx.expenseId}`
  } catch (err) {
    await deleteReceipt(key).catch(() => {}) // don't leave an orphan behind
    throw err
  }

  // Only drop the previous image once the new one is saved.
  if (ctx.oldKey) await deleteReceipt(ctx.oldKey).catch(err => console.error('Old receipt cleanup failed:', err))
  await logReceiptChange(ctx.expenseId, ctx.memberId, ctx.oldKey ? 'replaced' : 'added')
    .catch(err => console.error('Receipt activity log failed:', err))

  return NextResponse.json({ ok: true, receipt_url: receiptViewUrl(ctx.chatId, ctx.expenseId, key) })
}

export async function DELETE(request: Request, props: Props) {
  const ctx = await resolveExpense(request, props)
  if (!ctx.ok) return ctx.response

  if (ctx.oldKey) {
    await sql`UPDATE expenses SET receipt_key = NULL WHERE id = ${ctx.expenseId}`
    await deleteReceipt(ctx.oldKey).catch(err => console.error('Receipt delete failed:', err))
    await logReceiptChange(ctx.expenseId, ctx.memberId, 'removed')
      .catch(err => console.error('Receipt activity log failed:', err))
  }
  return NextResponse.json({ ok: true })
}
