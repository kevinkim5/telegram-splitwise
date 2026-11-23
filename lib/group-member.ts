import { sql } from '@/lib/sql'
import { ensureSchema } from '@/lib/db'

const lookup = (groupId: number, telegramUserId: number) => sql`
  SELECT id FROM members WHERE group_id = ${groupId} AND telegram_user_id = ${telegramUserId} AND removed_at IS NULL
`

export async function getGroupMember(
  groupId: number,
  telegramUserId: number,
): Promise<{ id: number } | null> {
  let rows
  try {
    rows = await lookup(groupId, telegramUserId)
  } catch (e) {
    // Right after a deploy that adds the removed_at column, requests from apps that are already open arrive
    // before anyone has opened the app (which is what normally applies schema changes). Apply the schema
    // now and retry once, instead of failing every request until that happens.
    if (!/removed_at/.test(String(e))) throw e
    await ensureSchema()
    rows = await lookup(groupId, telegramUserId)
  }
  const [member] = rows
  return member ? { id: member.id as number } : null
}
