import { sql } from '@/lib/sql'

// Removing / adding back a member of a group, shared by the app (a member removes someone, or leaves)
// and the admin dashboard. See the comment on DELETE /members/[memberId] for what removal means.

export type RemoveResult = 'removed' | 'not_found' | 'already_removed' | 'last_member'

// removedBy: the member who did it, or null when an admin did
export async function removeMember(groupId: number, targetId: number, removedBy: number | null): Promise<RemoveResult> {
  // The group row is locked first, in the same transaction: two people removing at once (the last two
  // members, say) then run one after the other, and the second sees the first one's removal. Without the
  // lock both would see two members left and both succeed, leaving the group empty.
  const [, removed] = await sql.transaction([
    sql`SELECT id FROM groups WHERE id = ${groupId} FOR UPDATE`,
    sql`
      UPDATE members SET removed_at = NOW(), removed_by = ${removedBy}
      WHERE id = ${targetId} AND group_id = ${groupId} AND removed_at IS NULL
        AND (SELECT COUNT(*) FROM members WHERE group_id = ${groupId} AND removed_at IS NULL) > 1
      RETURNING id
    `,
  ])
  if (removed.length > 0) return 'removed'
  const [target] = await sql`SELECT removed_at FROM members WHERE id = ${targetId} AND group_id = ${groupId}`
  if (!target) return 'not_found'
  return target.removed_at ? 'already_removed' : 'last_member'
}

// true when someone was added back (false: no such removed member in this group)
export async function restoreMember(groupId: number, targetId: number): Promise<boolean> {
  const restored = await sql`
    UPDATE members SET removed_at = NULL, removed_by = NULL
    WHERE id = ${targetId} AND group_id = ${groupId} AND removed_at IS NOT NULL
    RETURNING id
  `
  return restored.length > 0
}
