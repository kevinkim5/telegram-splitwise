import { sql } from '@/lib/sql'

// Checks that every id is a member of this group. A member who has been removed from the group is not
// accepted by default (nobody can be added to a new expense once removed). Their past expenses and
// payments still involve them though, so callers pass `allowRemoved` where that is legitimate:
//   true          any removed member (recording a settlement that clears what they owe or are owed)
//   number[]      only these removed members (editing an expense they are already part of)
export async function validateGroupMembers(
  groupId: number,
  memberIds: number[],
  opts: { allowRemoved?: boolean | number[] } = {},
): Promise<boolean> {
  if (memberIds.length === 0) return true
  const uniqueIds = [...new Set(memberIds)]
  const allow = opts.allowRemoved
  const found = allow === true
    ? await sql`SELECT id FROM members WHERE group_id = ${groupId} AND id = ANY(${uniqueIds}::int[])`
    : Array.isArray(allow) && allow.length > 0
      ? await sql`
          SELECT id FROM members
          WHERE group_id = ${groupId} AND id = ANY(${uniqueIds}::int[])
            AND (removed_at IS NULL OR id = ANY(${allow}::int[]))
        `
      : await sql`SELECT id FROM members WHERE group_id = ${groupId} AND id = ANY(${uniqueIds}::int[]) AND removed_at IS NULL`
  return found.length === uniqueIds.length
}
