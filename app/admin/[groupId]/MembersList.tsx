'use client'

import { useState } from 'react'
import { removalConfirmText, type BalanceLine } from '@/lib/member-removal'
import type { MemberActionResult } from '@/lib/admin-members'

export interface AdminGroupMember {
  id: number
  name: string
  username: string | null
  telegramId: string
  joined: string
  removed: string | null // date they were removed, or null while they are in the group
  lines: BalanceLine[]   // what they still owe (negative) / are owed (positive), per currency
}

const grey = '#9ca3af'
const btn: React.CSSProperties = { border: '1px solid #d1d5db', background: '#fff', fontSize: '0.75rem', fontWeight: 600, borderRadius: 8, padding: '5px 11px', cursor: 'pointer', whiteSpace: 'nowrap' }

function Row({ m, last, remove, restore, onError }: {
  m: AdminGroupMember
  last: boolean
  remove: (id: number) => Promise<MemberActionResult>
  restore: (id: number) => Promise<MemberActionResult>
  onError: (message: string | null) => void
}) {
  const [busy, setBusy] = useState(false)
  const isRemoved = !!m.removed

  const run = async (action: (id: number) => Promise<MemberActionResult>) => {
    setBusy(true)
    onError(null)
    try {
      const r = await action(m.id)
      if (r.error) onError(r.error)
    } catch {
      onError("Couldn't save that. Check your connection and try again.")
    } finally {
      setBusy(false)
    }
  }
  const onRemove = () => {
    if (window.confirm(removalConfirmText(m.name, false, m.lines))) run(remove)
  }
  const onRestore = () => {
    if (window.confirm(`Add ${m.name} back to the group?\n\nThey will be able to open the group again, and everything of theirs comes back as it was.`)) run(restore)
  }
  const owes = m.lines.filter(l => l.net < 0), owed = m.lines.filter(l => l.net > 0)
  const money = (ls: BalanceLine[]) => ls.map(l => `${l.currency} ${Math.abs(l.net).toFixed(2)}`).join(' + ')

  return (
    <div style={{ padding: '0.75rem 1rem', borderBottom: last ? 'none' : '0.5px solid #f3f4f6', background: isRemoved ? '#fafafa' : undefined }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 500, fontSize: '0.875rem', ...(isRemoved ? { color: grey } : {}) }}>
            {m.name}
            {isRemoved && <span style={{ marginLeft: 6, fontSize: '0.625rem', fontWeight: 700, color: '#b91c1c', background: '#fee2e2', borderRadius: 999, padding: '1px 8px' }}>removed</span>}
          </span>
          <span style={{ fontSize: '0.8125rem', color: '#6b7280', marginLeft: 8 }}>{m.username ? `@${m.username}` : ''}</span>
        </div>
        <button onClick={isRemoved ? onRestore : onRemove} disabled={busy} style={{ ...btn, color: isRemoved ? '#2563eb' : '#b91c1c', opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Saving…' : isRemoved ? 'Add back' : 'Remove'}
        </button>
      </div>
      <div style={{ fontSize: '0.75rem', color: grey, marginTop: '0.125rem' }}>
        Telegram ID {m.telegramId} · joined {m.joined}{m.removed ? ` · removed ${m.removed}` : ''}
      </div>
      {(owes.length > 0 || owed.length > 0) && (
        <div style={{ fontSize: '0.75rem', marginTop: '0.125rem', color: owes.length ? '#dc2626' : '#16a34a' }}>
          {[owes.length ? `owes ${money(owes)}` : null, owed.length ? `is owed ${money(owed)}` : null].filter(Boolean).join(' · ')}
        </div>
      )}
    </div>
  )
}

// The group's members with Remove / Add back. Removing never deletes anything: see the app's Members sheet.
export function MembersList({ members, remove, restore }: {
  members: AdminGroupMember[]
  remove: (id: number) => Promise<MemberActionResult>
  restore: (id: number) => Promise<MemberActionResult>
}) {
  const [error, setError] = useState<string | null>(null)
  return (
    <div>
      {error && <div role="alert" style={{ padding: '0.5rem 1rem', color: '#b91c1c', fontSize: '0.8125rem', borderBottom: '0.5px solid #f3f4f6' }}>{error}</div>}
      {members.map((m, i) => (
        <Row key={m.id} m={m} last={i === members.length - 1} remove={remove} restore={restore} onError={setError} />
      ))}
    </div>
  )
}
