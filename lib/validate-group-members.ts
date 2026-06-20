import { sql } from '@/lib/sql'

export async function validateGroupMembers(
  groupId: number,
  memberIds: number[],
): Promise<boolean> {
  if (memberIds.length === 0) return true
  const uniqueIds = [...new Set(memberIds)]
  const found = await sql`
    SELECT id FROM members WHERE group_id = ${groupId} AND id = ANY(${uniqueIds}::int[])
  `
  return found.length === uniqueIds.length
}
