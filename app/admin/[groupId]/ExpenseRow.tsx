'use client'

import { useState } from 'react'

interface Split { name: string; amount: string }

interface Props {
  description: string
  paidBy: string
  date: string
  currency: string
  amount: number
  category: string | null
  splits: Split[]
  last: boolean
}

export function ExpenseRow({ description, paidBy, date, currency, amount, category, splits, last }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div style={{ borderBottom: last ? 'none' : '0.5px solid #f3f4f6' }}>
      <div
        onClick={() => setExpanded(e => !e)}
        style={{ padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
      >
        <div style={{ flex: 1, minWidth: 0, marginRight: '0.75rem' }}>
          <div style={{ fontWeight: 500, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {description}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>
            {paidBy} · {date}{category ? ` · ${category}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
            {currency} {amount.toFixed(2)}
          </span>
          <span style={{ color: '#9ca3af', fontSize: '0.625rem' }}>{expanded ? '▲' : '▼'}</span>
        </div>
      </div>

      {expanded && (
        <div style={{ background: '#f9fafb', borderTop: '0.5px solid #f3f4f6', padding: '0.5rem 1rem 0.75rem' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#9ca3af', marginBottom: '0.375rem' }}>
            Split
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            {splits.map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem' }}>
                <span style={{ color: '#374151' }}>{s.name}</span>
                <span style={{ color: '#374151', fontWeight: 500 }}>{currency} {parseFloat(s.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
