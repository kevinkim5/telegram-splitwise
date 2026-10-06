'use client'

import { useState } from 'react'
import { describeChange, type Change } from '@/lib/expense-history'

interface Split { name: string; amount: string }
export interface HistoryEvent {
  type: 'created' | 'edited' | 'deleted' | 'restored'
  actor: 'member' | 'admin'
  actorName: string | null
  when: string
  changes: Change[]
  summary: string | null
}
export interface AdminExpense {
  id: number
  description: string
  paidBy: string
  date: string
  currency: string
  amount: number
  category: string | null
  splits: Split[]
  deleted: boolean
  deletedNote: string | null
  editCount: number
  history: HistoryEvent[] // newest first
}

const grey = '#9ca3af'
const fmt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function historyText(e: HistoryEvent): string {
  const who = e.actor === 'admin' ? 'Admin' : e.actorName ?? 'Someone'
  if (e.type === 'created') return `${who} created${e.summary ? ` · ${e.summary}` : ''}`
  if (e.type === 'deleted') return `${who} deleted`
  if (e.type === 'restored') return `${who} restored`
  return `${who} edited${e.changes.length ? ` · ${e.changes.map(describeChange).join(', ')}` : ''}`
}

function Row({ e, last, restore }: { e: AdminExpense; last: boolean; restore: (id: number) => Promise<void> }) {
  const [expanded, setExpanded] = useState(false)
  const [busy, setBusy] = useState(false)

  const onRestore = async (ev: React.MouseEvent) => {
    ev.stopPropagation()
    if (!window.confirm(`Restore "${e.description}"?\n\nIt will appear in the group again and count towards balances.`)) return
    setBusy(true)
    try { await restore(e.id) } finally { setBusy(false) }
  }

  return (
    <div style={{ borderBottom: last ? 'none' : '0.5px solid #f3f4f6', background: e.deleted ? '#fafafa' : undefined }}>
      <div
        onClick={() => setExpanded(x => !x)}
        style={{ padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div style={{ flex: 1, minWidth: 0, marginRight: '0.75rem' }}>
          <div style={{ fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', ...(e.deleted ? { textDecoration: 'line-through', color: grey } : {}) }}>
            {e.description}
            {e.deleted && <span style={{ ...pill, background: '#fee2e2', color: '#b91c1c' }}>deleted</span>}
            {!e.deleted && e.editCount > 0 && <span style={{ ...pill, background: '#eef2ff', color: '#4f46e5' }}>edited ×{e.editCount}</span>}
          </div>
          <div style={{ fontSize: '0.75rem', color: grey, marginTop: '0.125rem' }}>
            {e.paidBy} · {e.date}{e.category ? ` · ${e.category}` : ''}{e.deletedNote ? ` · ${e.deletedNote}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem', ...(e.deleted ? { color: grey } : {}) }}>
            {e.currency} {e.amount.toFixed(2)}
          </span>
          {e.deleted
            ? <button onClick={onRestore} disabled={busy} style={restoreBtn}>{busy ? 'Restoring…' : 'Restore'}</button>
            : <span style={{ color: grey, fontSize: '0.625rem' }}>{expanded ? '▲' : '▼'}</span>}
        </div>
      </div>

      {expanded && (
        <div style={{ background: '#f9fafb', borderTop: '0.5px solid #f3f4f6', padding: '0.5rem 1rem 0.75rem' }}>
          <div style={heading}>Split</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {e.splits.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                <span style={{ color: '#374151' }}>{s.name}</span>
                <span style={{ color: '#374151', fontWeight: 500 }}>{e.currency} {parseFloat(s.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
          <div style={{ ...heading, marginTop: '0.75rem' }}>History</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {e.history.map((h, i) => (
              <div key={i} style={{ display: 'flex', gap: '0.625rem', fontSize: '0.8125rem' }}>
                <span style={{ color: grey, fontSize: '0.71875rem', minWidth: 92, flexShrink: 0, paddingTop: 1 }}>{fmt(h.when)}</span>
                <span style={{ color: '#374151' }}>{historyText(h)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

const pill: React.CSSProperties = { display: 'inline-block', fontSize: '0.625rem', fontWeight: 700, borderRadius: 999, padding: '1px 8px', marginLeft: 6, verticalAlign: 1, textDecoration: 'none' }
const restoreBtn: React.CSSProperties = { border: '1px solid #d1d5db', background: '#fff', color: '#111827', fontSize: '0.75rem', fontWeight: 600, borderRadius: 8, padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap' }
const heading: React.CSSProperties = { fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: grey, marginBottom: '0.375rem' }

export function ExpensesList({ expenses, restore }: { expenses: AdminExpense[]; restore: (id: number) => Promise<void> }) {
  const [showDeleted, setShowDeleted] = useState(false)
  const deletedCount = expenses.filter(e => e.deleted).length
  const rows = showDeleted ? expenses : expenses.filter(e => !e.deleted)

  return (
    <>
      {deletedCount > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0.5rem 1rem', fontSize: '0.8125rem', color: '#2563eb', fontWeight: 600, borderBottom: '0.5px solid #f3f4f6', cursor: 'pointer' }}>
          <input type="checkbox" checked={showDeleted} onChange={ev => setShowDeleted(ev.target.checked)} />
          Show deleted ({deletedCount})
        </label>
      )}
      {rows.length === 0
        ? <div style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.875rem' }}>No expenses yet.</div>
        : rows.map((e, i) => <Row key={e.id} e={e} last={i === rows.length - 1} restore={restore} />)}
    </>
  )
}
