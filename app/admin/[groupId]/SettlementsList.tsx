'use client'

import { useState } from 'react'

export interface AdminSettlement {
  id: number
  from: string
  to: string
  currency: string
  amount: number
  date: string
  deleted: boolean
  deletedDate: string | null
}

const grey = '#9ca3af'

function Row({ s, last, restore }: { s: AdminSettlement; last: boolean; restore: (id: number) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const onRestore = async () => {
    if (!window.confirm(`Restore this payment?\n\n${s.from} paid ${s.to} ${s.currency} ${s.amount.toFixed(2)}. It will count towards balances again.`)) return
    setBusy(true)
    try { await restore(s.id) } finally { setBusy(false) }
  }
  return (
    <div style={{ padding: '0.75rem 1rem', borderBottom: last ? 'none' : '0.5px solid #f3f4f6', background: s.deleted ? '#fafafa' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <span style={{ fontSize: '0.875rem', ...(s.deleted ? { textDecoration: 'line-through', color: grey } : {}) }}>
          <span style={{ fontWeight: 500 }}>{s.from}</span>
          <span style={{ color: grey }}> paid </span>
          <span style={{ fontWeight: 500 }}>{s.to}</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: s.deleted ? grey : '#16a34a' }}>
            {s.currency} {s.amount.toFixed(2)}
          </span>
          {s.deleted && (
            <button
              onClick={onRestore}
              disabled={busy}
              style={{ border: '1px solid #d1d5db', background: '#fff', color: '#111827', fontSize: '0.75rem', fontWeight: 600, borderRadius: 8, padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {busy ? 'Restoring…' : 'Restore'}
            </button>
          )}
        </span>
      </div>
      <div style={{ fontSize: '0.75rem', color: grey, marginTop: '0.125rem' }}>
        {s.date}
        {s.deleted && (
          <span>
            <span style={{ display: 'inline-block', fontSize: '0.625rem', fontWeight: 700, borderRadius: 999, padding: '1px 8px', marginLeft: 6, background: '#fee2e2', color: '#b91c1c' }}>deleted</span>
            {s.deletedDate ? ` ${s.deletedDate}` : ''}
          </span>
        )}
      </div>
    </div>
  )
}

export function SettlementsList({ settlements, showDeleted, restore }: { settlements: AdminSettlement[]; showDeleted: boolean; restore: (id: number) => Promise<void> }) {
  const rows = showDeleted ? settlements : settlements.filter(s => !s.deleted)
  if (rows.length === 0) {
    return <div style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.875rem' }}>No settlements yet.</div>
  }
  return <>{rows.map((s, i) => <Row key={s.id} s={s} last={i === rows.length - 1} restore={restore} />)}</>
}
