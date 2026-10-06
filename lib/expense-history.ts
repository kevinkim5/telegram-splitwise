// Pure helpers for the per-expense activity log: what changed between two versions of an expense,
// and a one-line description of a brand-new one. Stored as JSON in expense_events.changes.

export type ChangeField = 'description' | 'amount' | 'paid_by' | 'date' | 'category' | 'split' | 'receipt'

export interface Change {
  field: ChangeField
  from?: string | null
  to?: string | null
}

export interface ExpenseSnapshot {
  description: string
  total_amount: number
  currency: string
  paid_by_member_id: number
  paid_by_name: string
  split_type: 'equal' | 'custom' | 'shares'
  date: string // YYYY-MM-DD (a longer ISO timestamp is trimmed)
  category: string | null
  splits: { member_id: number; member_name: string; amount: number }[]
}

const day = (d: string) => String(d).slice(0, 10)
const money = (currency: string, amount: number) => `${currency} ${Number(amount).toFixed(2)}`
const cents = (n: number) => Math.round(Number(n) * 100)

function splitSummary(s: ExpenseSnapshot): string {
  const names = s.splits.map(x => x.member_name).sort((a, b) => a.localeCompare(b)).join(', ')
  return `${names} (${s.split_type === 'equal' ? 'equal' : 'custom amounts'})`
}

function splitChanged(a: ExpenseSnapshot, b: ExpenseSnapshot): boolean {
  if (a.split_type !== b.split_type) return true
  const ids = (s: ExpenseSnapshot) => s.splits.map(x => x.member_id).sort((x, y) => x - y)
  const ia = ids(a), ib = ids(b)
  if (ia.length !== ib.length || ia.some((id, i) => id !== ib[i])) return true
  if (a.split_type === 'equal') return false // the amounts follow from the total
  const amt = (s: ExpenseSnapshot) => new Map(s.splits.map(x => [x.member_id, cents(x.amount)]))
  const ma = amt(a), mb = amt(b)
  return ia.some(id => ma.get(id) !== mb.get(id))
}

export function diffExpense(before: ExpenseSnapshot, after: ExpenseSnapshot): Change[] {
  const changes: Change[] = []
  if (before.description !== after.description) {
    changes.push({ field: 'description', from: before.description, to: after.description })
  }
  if (before.currency !== after.currency || cents(before.total_amount) !== cents(after.total_amount)) {
    changes.push({
      field: 'amount',
      from: money(before.currency, before.total_amount),
      to: money(after.currency, after.total_amount),
    })
  }
  if (before.paid_by_member_id !== after.paid_by_member_id) {
    changes.push({ field: 'paid_by', from: before.paid_by_name, to: after.paid_by_name })
  }
  if (day(before.date) !== day(after.date)) {
    changes.push({ field: 'date', from: day(before.date), to: day(after.date) })
  }
  if ((before.category ?? null) !== (after.category ?? null)) {
    changes.push({ field: 'category', from: before.category ?? null, to: after.category ?? null })
  }
  if (splitChanged(before, after)) {
    changes.push({ field: 'split', from: splitSummary(before), to: splitSummary(after) })
  }
  return changes
}

// "SGD 50.00 · paid by Kev · split equally between 3"
export function createdSummary(s: ExpenseSnapshot): string {
  const n = s.splits.length
  const how = s.split_type === 'equal' ? `split equally between ${n}` : `split between ${n} (custom amounts)`
  return `${money(s.currency, s.total_amount)} · paid by ${s.paid_by_name} · ${how}`
}

const FIELD_LABELS: Record<ChangeField, string> = {
  description: 'Description', amount: 'Amount', paid_by: 'Paid by', date: 'Date', category: 'Category',
  split: 'Split', receipt: 'Receipt',
}

// Plain-text version of one change, for places that don't need the styled old -> new layout.
export function describeChange(c: Change): string {
  if (c.field === 'receipt') return `Receipt ${c.to}`
  if (c.field === 'split') return `Split now ${c.to}`
  return `${FIELD_LABELS[c.field]}: ${c.from || '—'} → ${c.to || '—'}`
}
