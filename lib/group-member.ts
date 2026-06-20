import { sql } from '@/lib/sql'

export async function getGroupMember(
  groupId: number,
  telegramUserId: number,
): Promise<{ id: number } | null> {
  const [member] = await sql`
    SELECT id FROM members WHERE group_id = ${groupId} AND telegram_user_id = ${telegramUserId}
  `
  return member ? { id: member.id as number } : null
}
