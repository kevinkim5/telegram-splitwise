import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { ensureSchema } from '@/lib/db'

export interface AccessGroup { id: number; title: string; currency: string }

export type GroupAccess =
  | { ok: true; group: AccessGroup; member: { id: number } }
  | { ok: false; response: NextResponse }

// "Does this group exist, and is the caller one of its members?" in ONE query (it used to be two, one
// after the other, at the start of every request). Same answers as before: a missing or archived
// group is 404, a group the caller does not belong to (or was removed from) is 403. The member is
// matched on this group and this Telegram user only, and only while not removed.
export async function requireGroupMember(chatId: bigint, telegramUserId: number): Promise<GroupAccess> {
  const query = () => sql`
    SELECT g.id, g.title, g.currency, m.id AS member_id
    FROM groups g
    LEFT JOIN members m ON m.group_id = g.id AND m.telegram_user_id = ${telegramUserId} AND m.removed_at IS NULL
    WHERE g.chat_id = ${chatId} AND g.deleted_at IS NULL
  `
  let rows
  try {
    rows = await query()
  } catch (e) {
    // Right after a deploy that adds the removed_at column, requests from apps that are already open arrive
    // before anyone has opened the app (which is what normally applies schema changes). Apply the schema
    // now and retry once, instead of failing every request until that happens.
    if (!/removed_at/.test(String(e))) throw e
    await ensureSchema()
    rows = await query()
  }
  const [row] = rows
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
