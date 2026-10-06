'use client'

import { useState } from 'react'
import type { ActivityEvent } from '@/types'

const SHOWN_WHEN_COLLAPSED = 3
const hint = 'var(--tg-theme-hint-color)'

function formatWhen(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const now = new Date()
  if (d.toDateString() === now.toDateString()) return `Today, ${time}`
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) })
  return `${date}, ${time}`
}

function formatDay(value: string | null | undefined): string {
  if (!value) return '—'
  const d = new Date(`${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const LABELS: Record<string, string> = {
  description: 'Description', amount: 'Amount', paid_by: 'Paid by', date: 'Date', category: 'Category',
}

function ChangeLine({ change }: { change: ActivityEvent['changes'][number] }) {
  if (change.field === 'receipt') return <div>Receipt {change.to}</div>
  if (change.field === 'split') {
    return <div><span style={{ color: hint }}>Split now </span><span style={{ fontWeight: 600 }}>{change.to}</span></div>
  }
  const fmt = change.field === 'date' ? formatDay : (v: string | null | undefined) => (v ? v : '—')
  return (
    <div>
      <span style={{ color: hint }}>{LABELS[change.field] ?? change.field} </span>
      <span style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)', textDecoration: 'line-through' }}>{fmt(change.from)}</span>
      <span style={{ color: hint }}> → </span>
      <span style={{ color: '#1c9c48', fontWeight: 600 }}>{fmt(change.to)}</span>
    </div>
  )
}

function Entry({ ev }: { ev: ActivityEvent }) {
  const admin = ev.actor === 'admin'
  const name = admin ? 'Admin' : ev.actor_name ?? 'Someone'
  const verb = ev.type === 'created' ? 'created this expense'
    : ev.type === 'deleted' ? 'deleted this expense'
    : ev.type === 'restored' ? 'restored this expense'
    : 'edited'
  return (
    <div className="flex" style={{ gap: 11, padding: '10px 0' }}>
      <div
        aria-hidden
        style={{
          width: 28, height: 28, borderRadius: '50%', flex: 'none', color: '#fff', fontSize: 11, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: admin ? '#6b7280' : 'var(--tg-theme-button-color, #2481cc)',
        }}
      >
        {admin ? '⚙' : name.charAt(0).toUpperCase()}
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p className="text-sm" style={{ lineHeight: 1.35 }}>
          <span style={{ fontWeight: 600 }}>{name}</span> {verb}
        </p>
        <p style={{ fontSize: 11, color: hint, marginTop: 1 }}>{formatWhen(ev.created_at)}</p>
        {ev.type === 'created' && ev.summary && (
          <p style={{ fontSize: 12, color: hint, marginTop: 4 }}>{ev.summary}</p>
        )}
        {ev.type === 'edited' && ev.changes.length > 0 && (
          <div style={{ marginTop: 6, fontSize: 12, background: 'var(--tg-theme-secondary-bg-color)', borderRadius: 9, padding: '7px 10px', lineHeight: 1.6 }}>
            {ev.changes.map((c, i) => <ChangeLine key={i} change={c} />)}
          </div>
        )}
      </div>
    </div>
  )
}

// Newest first. The "created" entry always stays at the end; older changes are collapsed.
export function ExpenseActivity({ events }: { events: ActivityEvent[] }) {
  const [expanded, setExpanded] = useState(false)
  if (events.length === 0) return null
  const created = events.filter(e => e.type === 'created')
  const rest = events.filter(e => e.type !== 'created')
  const hidden = !expanded && rest.length > SHOWN_WHEN_COLLAPSED ? rest.length - SHOWN_WHEN_COLLAPSED : 0
  const shown = hidden ? rest.slice(0, SHOWN_WHEN_COLLAPSED) : rest
  const list = [...shown.map(e => ({ e, k: `e${e.id}` })), ...created.map(e => ({ e, k: 'created' }))]

  return (
    <div data-testid="activity" style={{ marginTop: 16 }}>
      <p className="tg-label mb-2">Activity</p>
      <div className="tg-section" style={{ padding: '2px 16px' }}>
        {list.map(({ e, k }, i) => (
          <div key={k} style={i > 0 ? { borderTop: '0.5px solid rgba(128,128,128,0.2)' } : undefined}>
            {hidden > 0 && k === 'created' && (
              <button
                type="button"
                onClick={() => setExpanded(true)}
                className="text-sm font-semibold"
                style={{ display: 'block', width: '100%', textAlign: 'center', padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg-theme-link-color)' }}
              >
                Show {hidden} earlier {hidden === 1 ? 'change' : 'changes'}
              </button>
            )}
            <Entry ev={e} />
          </div>
        ))}
      </div>
    </div>
  )
}
