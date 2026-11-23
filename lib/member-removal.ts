// Wording for removing someone from a group, kept apart from the screen so it can be tested.

export interface BalanceLine { currency: string; net: number } // net > 0: is owed money, net < 0: owes

const money = (l: BalanceLine) => `${l.currency} ${Math.abs(l.net).toFixed(2)}`
const list = (ls: BalanceLine[]) => ls.map(money).join(' + ')

// What the confirmation says. `lines` are the person's non-zero balances (empty when they are square).
export function removalConfirmText(name: string, isSelf: boolean, lines: BalanceLine[]): string {
  const owes = lines.filter(l => l.net < 0)
  const owed = lines.filter(l => l.net > 0)
  const parts: string[] = []
  if (isSelf) {
    parts.push('Leave this group? You will no longer be able to open it unless someone adds you back. Your past expenses stay in the group.')
  } else {
    parts.push(`Remove ${name} from this group? ${name} won't be able to open it unless someone adds them back. Their past expenses stay in the group.`)
  }
  if (owes.length || owed.length) {
    const who = isSelf ? 'You' : name
    const bits: string[] = []
    if (owes.length) bits.push(`${isSelf ? 'owe' : 'owes'} ${list(owes)}`)
    if (owed.length) bits.push(`${isSelf ? 'are' : 'is'} owed ${list(owed)}`)
    parts.push(`${who} still ${bits.join(' and ')}. ${isSelf ? 'You' : 'They'} will stay on the Balances tab, marked removed, until it is settled.`)
  }
  return parts.join('\n\n')
}

// The non-zero balance lines for one member out of the per-currency balances the server returns
export function balanceLinesFor(
  memberId: number,
  byCurrency: Record<string, Array<{ member_id: number; net_amount: number }>> | undefined,
): BalanceLine[] {
  if (!byCurrency) return []
  return Object.entries(byCurrency).flatMap(([currency, rows]) => {
    const r = rows.find(x => x.member_id === memberId)
    return r && Math.abs(r.net_amount) > 0.005 ? [{ currency, net: r.net_amount }] : []
  })
}
