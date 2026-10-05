import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { parseChatId } from '@/lib/parse-params'
import { readReceiptImage } from '@/lib/receipt-image'
import {
  isEmptyReceipt,
  parseReceipt,
  receiptParsingConfigured,
  ReceiptParseError,
} from '@/lib/receipt-parse'

export const maxDuration = 30

const SCANS_PER_HOUR = 20

// Reads a receipt photo and returns suggested expense fields. The image is processed in memory
// and not stored; storing happens separately once the expense is saved.
export async function POST(request: Request, props: { params: Promise<{ chatId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })

  if (!receiptParsingConfigured()) {
    return NextResponse.json({ error: 'Receipt scanning is not set up yet' }, { status: 503 })
  }

  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${chatIdBig} AND deleted_at IS NULL`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const member = await getGroupMember(group.id as number, user.id)
  if (!member) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const image = await readReceiptImage(request)
  if (!image.ok) return NextResponse.json({ error: image.error }, { status: image.status })

  // Each scan costs money: cap per user. Log first so concurrent requests can't slip past.
  const [{ n }] = await sql`
    SELECT COUNT(*)::int AS n FROM receipt_scans
    WHERE telegram_user_id = ${user.id} AND created_at > NOW() - INTERVAL '1 hour'
  `
  if ((n as number) >= SCANS_PER_HOUR) {
    return NextResponse.json({ error: 'Too many scans. Try again in a little while.' }, { status: 429 })
  }
  await sql`INSERT INTO receipt_scans (telegram_user_id) VALUES (${user.id})`

  try {
    const receipt = await parseReceipt(image.bytes, image.type)
    if (isEmptyReceipt(receipt)) {
      return NextResponse.json({ error: "Couldn't read this receipt. Try a clearer photo." }, { status: 422 })
    }
    return NextResponse.json(receipt)
  } catch (err) {
    if (err instanceof ReceiptParseError) {
      return NextResponse.json({ error: err.message }, { status: err.status })
    }
    console.error('Receipt parse error:', err)
    return NextResponse.json({ error: 'Receipt scanning failed. Try again.' }, { status: 500 })
  }
}
