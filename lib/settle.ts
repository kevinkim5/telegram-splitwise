import type { SimplifiedDebt } from '@/types'

// One currency's worth of debt between you and one other person.
export interface SettleEntry {
  key: string
  currency: string
  owed: number
  direction: 'pay' | 'receive' // pay = you owe them, receive = they owe you
  from: number
  to: number
}

export interface SettleGroup {
  personId: number
  personName: string
  entries: SettleEntry[] // what you pay first, then what you receive
}

// Collapse the simplified debts that involve `myId` into one group per other person.
export function groupDebtsByPerson(debts: SimplifiedDebt[], myId: number): SettleGroup[] {
  const groups = new Map<number, SettleGroup>()
  for (const d of debts) {
    const iOwe = d.from_member_id === myId
    if (!iOwe && d.to_member_id !== myId) continue
    const personId = iOwe ? d.to_member_id : d.from_member_id
    const personName = iOwe ? d.to_name : d.from_name
    if (!groups.has(personId)) groups.set(personId, { personId, personName, entries: [] })
    const direction = iOwe ? 'pay' : 'receive'
    groups.get(personId)!.entries.push({
      key: `${direction}-${d.currency}`,
      currency: d.currency,
      owed: d.amount,
      direction,
      from: d.from_member_id,
      to: d.to_member_id,
    })
  }
  for (const g of groups.values()) {
    g.entries.sort((a, b) =>
      a.direction === b.direction ? a.currency.localeCompare(b.currency) : a.direction === 'pay' ? -1 : 1)
  }
  return [...groups.values()]
}

export type FieldCheck =
  | { status: 'skip' }
  | { status: 'ok'; amount: number }
  | { status: 'error'; message: string }

const TOLERANCE = 0.005

// Check what was typed into one currency's field. Empty means "skip this currency".
export function checkAmount(entry: SettleEntry, raw: string): FieldCheck {
  const text = raw.trim()
  if (text === '') return { status: 'skip' }
  const n = Number(text)
  if (!Number.isFinite(n)) return { status: 'error', message: 'Enter a valid amount.' }
  const amount = Math.round(n * 100) / 100
  if (amount <= 0) return { status: 'error', message: 'Enter an amount above 0, or leave it empty to skip.' }
  if (amount > entry.owed + TOLERANCE) {
    return {
      status: 'error',
      message: entry.direction === 'pay'
        ? `That's more than you owe. The most you can pay is ${entry.currency} ${entry.owed.toFixed(2)}.`
        : `That's more than you're owed. The most you can record is ${entry.currency} ${entry.owed.toFixed(2)}.`,
    }
  }
  return { status: 'ok', amount }
}

export interface Payment {
  from_member_id: number
  to_member_id: number
  amount: number
  currency: string
}

// Turn the typed amounts into the payments to record. Fails if any field is invalid or if
// everything was left empty.
export function buildPayments(
  entries: SettleEntry[],
  raws: Record<string, string>,
): { ok: true; payments: Payment[] } | { ok: false; error: string } {
  const payments: Payment[] = []
  for (const e of entries) {
    const check = checkAmount(e, raws[e.key] ?? '')
    if (check.status === 'error') return { ok: false, error: check.message }
    if (check.status === 'ok') {
      payments.push({ from_member_id: e.from, to_member_id: e.to, amount: check.amount, currency: e.currency })
    }
  }
  if (payments.length === 0) return { ok: false, error: 'Enter an amount for at least one currency.' }
  return { ok: true, payments }
}
