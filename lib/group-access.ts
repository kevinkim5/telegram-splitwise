import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'

export interface AccessGroup { id: number; title: string; currency: string }

export type GroupAccess =
  | { ok: true; group: AccessGroup; member: { id: number } }
  | { ok: false; response: NextResponse }

// "Does this group exist, and is the caller one of its members?" in ONE query (it used to be two, one
// after the other, at the start of every request). Same answers as before: a missing or archived
// group is 404, a group the caller does not belong to is 403. The member is matched on this group
// and this Telegram user only.
export async function requireGroupMember(chatId: bigint, telegramUserId: number): Promise<GroupAccess> {
  const [row] = await sql`
    SELECT g.id, g.title, g.currency, m.id AS member_id
    FROM groups g
    LEFT JOIN members m ON m.group_id = g.id AND m.telegram_user_id = ${telegramUserId}
    WHERE g.chat_id = ${chatId} AND g.deleted_at IS NULL
  `
  if (!row) return { ok: false, response: NextResponse.json({ error: 'Group not found' }, { status: 404 }) }
  if (row.member_id === null || row.member_id === undefined) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return {
    ok: true,
    group: { id: row.id as number, title: row.title as string, currency: row.currency as string },
    member: { id: row.member_id as number },
  }
}
