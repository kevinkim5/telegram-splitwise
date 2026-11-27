import { removeMember, restoreMember } from '@/lib/member-store'

export type MemberActionResult = { error?: string }

// What the admin dashboard's Remove / Add back buttons do (the page's server actions call these after
// checking the admin is signed in). An admin removal records no member as the remover.
export async function adminRemoveMember(groupId: number, memberId: number): Promise<MemberActionResult> {
  const r = await removeMember(groupId, memberId, null)
  if (r === 'removed') return {}
  if (r === 'last_member') return { error: "You can't remove the last member of a group." }
  if (r === 'already_removed') return { error: 'That member was already removed.' }
  return { error: 'Member not found.' }
}

export async function adminRestoreMember(groupId: number, memberId: number): Promise<MemberActionResult> {
  return (await restoreMember(groupId, memberId)) ? {} : { error: 'That member is not removed.' }
}
