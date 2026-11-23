import { NextResponse } from 'next/server'
import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { parseChatId } from '@/lib/parse-params'

// Remove a member from the group (or, when it is yourself, leave it).
//
// The member is not deleted: their past expenses, splits and payments still point at them, and
// deleting would either be refused by the database or silently drop their splits. They are marked
// removed instead, so that:
//   - they can no longer open the group or use any of its API (see getGroupMember)
//   - they cannot be added to new expenses or picked in the app; old expenses they are on stay readable
//   - their name stays on history, and on Balances for as long as they owe or are owed money
//     (others can still record a payment with them to clear it)
// Any member can remove any other member (same trust as editing expenses), and the last remaining member
// cannot be removed, so a group is never left empty (even when two people try at the same moment).
export async function DELETE(request: Request, props: { params: Promise<{ chatId: string; memberId: string }> }) {
  const user = getAuthUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { chatId, memberId } = await props.params
  const chatIdBig = parseChatId(chatId)
  if (!chatIdBig) return NextResponse.json({ error: 'Invalid group ID' }, { status: 400 })
  const targetId = /^\d+$/.test(memberId) ? parseInt(memberId, 10) : NaN
  if (!Number.isSafeInteger(targetId) || targetId <= 0) return NextResponse.json({ error: 'Invalid member ID' }, { status: 400 })

  const [group] = await sql`SELECT id FROM groups WHERE chat_id = ${chatIdBig} AND deleted_at IS NULL`
  if (!group) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const caller = await getGroupMember(group.id as number, user.id)
  if (!caller) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // The group row is locked first, in the same transaction: two people removing at once (the last two
  // members, say) then run one after the other, and the second sees the first one's removal. Without the
  // lock both would see two members left and both succeed, leaving the group empty.
  const [, removed] = await sql.transaction([
    sql`SELECT id FROM groups WHERE id = ${group.id} FOR UPDATE`,
    sql`
      UPDATE members SET removed_at = NOW(), removed_by = ${caller.id}
      WHERE id = ${targetId} AND group_id = ${group.id} AND removed_at IS NULL
        AND (SELECT COUNT(*) FROM members WHERE group_id = ${group.id} AND removed_at IS NULL) > 1
      RETURNING id
    `,
  ])
  if (removed.length === 0) {
    const [target] = await sql`SELECT removed_at FROM members WHERE id = ${targetId} AND group_id = ${group.id}`
    if (!target) return NextResponse.json({ error: 'Member not found' }, { status: 404 })
    if (target.removed_at) return NextResponse.json({ error: 'Already removed from the group' }, { status: 409 })
    return NextResponse.json({ error: "You can't remove the last member of a group" }, { status: 409 })
  }

  return NextResponse.json({ ok: true, left: targetId === caller.id })
}
