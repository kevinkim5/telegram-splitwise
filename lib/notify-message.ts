import { sumConverted } from '@/lib/convert'
import type { SimplifiedDebt } from '@/types'

export const NOTIFY_TARGET = 'SGD'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The Telegram (HTML) message for "Notify group". Each person who owes gets a block, one line per
// person they owe. When someone owes the same person in several currencies, the line shows the
// total in SGD (at today's rates) followed by the original amounts. Without a rate for every
// currency in a line, the original amounts are listed instead: never a partial total.
// `display` must return HTML-safe text.
export function buildNotifyMessage(
  title: string,
  debts: SimplifiedDebt[],
  display: (memberId: number) => string,
  rates: Record<string, number> | null,
): string {
  const byDebtor = groupByDebtor(debts)

  const sections = [...byDebtor.entries()].map(([debtorId, creditors]) => {
    const rows = owedRows(creditors, display, rates)
    return [`<b>${display(debtorId)}</b> owes:`, ...rows].join('\n')
  })

  return [
    `💰 <b>${esc(title)}</b> — outstanding balances`,
    '',
    sections.join('\n\n'),
  ].join('\n')
}

type ByCreditor = Map<number, SimplifiedDebt[]>

function groupByDebtor(debts: SimplifiedDebt[]): Map<number, ByCreditor> {
  const byDebtor = new Map<number, ByCreditor>()
  for (const d of debts) {
    const creditors = byDebtor.get(d.from_member_id) ?? new Map<number, SimplifiedDebt[]>()
    creditors.set(d.to_member_id, [...(creditors.get(d.to_member_id) ?? []), d])
    byDebtor.set(d.from_member_id, creditors)
  }
  return byDebtor
}

// One "  • who  amount" line per person owed (see the rules in the comment on buildNotifyMessage)
function owedRows(creditors: ByCreditor, display: (memberId: number) => string, rates: Record<string, number> | null): string[] {
  return [...creditors.entries()].map(([creditorId, lines]) => {
    const parts = lines.map(l => `${l.currency} ${l.amount.toFixed(2)}`)
    const onlyTarget = lines.every(l => l.currency === NOTIFY_TARGET)
    const sum = onlyTarget ? null : sumConverted(
      lines.map(l => ({ currency: l.currency, net: l.amount })), rates, NOTIFY_TARGET)
    let amount: string
    if (onlyTarget) {
      amount = parts.join(' + ')
    } else if (sum && sum.missing.length === 0) {
      amount = `≈ ${NOTIFY_TARGET} ${sum.total.toFixed(2)} (${parts.join(' + ')})`
    } else {
      amount = parts.join(' + ')
    }
    return `  • ${display(creditorId)}  ${amount}`
  })
}

// The private reminders: one message per person who owes, listing only what THEY owe. Same amount
// rules as the group message. Returns debtor member id -> HTML message. People who are only owed
// money get nothing. `display` must return HTML-safe text.
export function buildPrivateMessages(
  title: string,
  debts: SimplifiedDebt[],
  display: (memberId: number) => string,
  rates: Record<string, number> | null,
): Map<number, string> {
  const messages = new Map<number, string>()
  for (const [debtorId, creditors] of groupByDebtor(debts)) {
    messages.set(debtorId, [
      `💰 <b>${esc(title)}</b>`,
      'You owe:',
      ...owedRows(creditors, display, rates),
    ].join('\n'))
  }
  return messages
}
