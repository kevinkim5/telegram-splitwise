'use client'

import { useEffect, useState } from 'react'
import { useAppContext } from '@/components/AppProvider'
import { CurrencyPicker } from '@/components/CurrencyPicker'
import { REMINDER_TIME_LABEL, WEEKDAYS as WEEKDAY_NAMES } from '@/lib/reminder'

const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD',
  '#F39C12', '#1ABC9C', '#9B59B6', '#E67E22', '#2ECC71',
]

export function MemberAvatar({ member, size = 36 }: { member: { id: number; first_name: string; photo_url?: string | null }; size?: number }) {
  const color = AVATAR_COLORS[member.id % AVATAR_COLORS.length]
  if (member.photo_url) {
    return (
      <img
        src={member.photo_url}
        alt={member.first_name}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div
      className="flex items-center justify-center text-sm font-bold flex-shrink-0"
      style={{ width: size, height: size, borderRadius: '50%', background: color, color: '#fff', fontSize: size * 0.4 }}
    >
      {member.first_name[0].toUpperCase()}
    </div>
  )
}

export function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  )
}

export function MembersSheet({ onClose }: { onClose: () => void }) {
  const { members } = useAppContext()
  return (
    <div
      className="fixed inset-0 flex items-end justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full rounded-t-2xl flex flex-col"
        style={{ background: 'var(--tg-theme-bg-color)', maxHeight: '70dvh' }}
      >
        <div className="flex justify-between items-center p-4 pb-3">
          <h2 className="text-lg font-bold">Group Members</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: 'var(--tg-theme-hint-color)' }}
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-4 pb-6">
          <div className="tg-section">
            {members.map((m, idx) => (
              <div
                key={m.id}
                className="tg-list-item flex items-center gap-3"
                style={{ borderBottom: idx === members.length - 1 ? 'none' : undefined }}
              >
                <MemberAvatar member={m} size={36} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {m.first_name}{m.last_name ? ` ${m.last_name}` : ''}
                  </p>
                  {m.username && (
                    <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>@{m.username}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const pillStyle = (selected: boolean): React.CSSProperties => ({
  minWidth: 44, padding: '8px 12px', borderRadius: 999, fontSize: 14, fontWeight: 600, cursor: 'pointer',
  border: selected ? 'none' : '1px solid var(--tg-theme-hint-color)',
  background: selected ? 'var(--tg-theme-button-color)' : 'transparent',
  color: selected ? 'var(--tg-theme-button-text-color)' : 'var(--tg-theme-text-color)',
})

// Weekdays in the order people read them (Monday first); the value is the weekday number the server stores (0 = Sunday)
const REMINDER_PILLS: { label: string; day: number }[] = [
  { label: 'Mon', day: 1 }, { label: 'Tue', day: 2 }, { label: 'Wed', day: 3 }, { label: 'Thu', day: 4 },
  { label: 'Fri', day: 5 }, { label: 'Sat', day: 6 }, { label: 'Sun', day: 0 },
]

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { chatId, group, apiHeaders, refreshGroup } = useAppContext()
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)

  // Weekly reminder: loaded when the sheet opens; a tap saves straight away
  const [reminder, setReminder] = useState<{ day: number | null; setBy: string | null } | null>(null)
  const [reminderError, setReminderError] = useState<string | null>(null)
  const [reminderSaving, setReminderSaving] = useState(false)
  useEffect(() => {
    let cancelled = false
    fetch(`/api/groups/${chatId}/settings`, { headers: apiHeaders })
      .then(r => (r.ok ? r.json() : null))
      .then((d: { reminder_day?: number | null; reminder_set_by?: string | null } | null) => {
        if (!cancelled && d) setReminder({ day: d.reminder_day ?? null, setBy: d.reminder_set_by ?? null })
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [chatId, apiHeaders])

  const saveReminder = async (day: number | null) => {
    if (!reminder || reminderSaving) return
    const previous = reminder
    setReminder({ day, setBy: previous.setBy })
    setReminderError(null)
    setReminderSaving(true)
    try {
      const res = await fetch(`/api/groups/${chatId}/settings`, {
        method: 'PUT',
        headers: apiHeaders,
        body: JSON.stringify({ reminder_day: day }),
      })
      if (!res.ok) throw new Error()
      const d = await res.json() as { reminder_day?: number | null; reminder_set_by?: string | null }
      setReminder({ day: d.reminder_day ?? null, setBy: d.reminder_set_by ?? null })
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')
    } catch {
      setReminder(previous)
      setReminderError("Couldn't save the reminder. Check your connection and try again.")
    } finally {
      setReminderSaving(false)
    }
  }

  const handleCurrencySelect = async (currency: string) => {
    try {
      await fetch(`/api/groups/${chatId}/settings`, {
        method: 'PUT',
        headers: apiHeaders,
        body: JSON.stringify({ currency }),
      })
      await refreshGroup()
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')
    } catch { /* ignore */ }
    setShowCurrencyPicker(false)
  }

  return (
    <>
      <div
        className="fixed inset-0 flex items-end justify-center z-50"
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose() }}
      >
        <div className="w-full rounded-t-2xl flex flex-col" style={{ background: 'var(--tg-theme-bg-color)', maxHeight: '70dvh' }}>
          <div className="flex justify-between items-center p-4 pb-3">
            <h2 className="text-lg font-bold">Group Settings</h2>
            <button onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: 'var(--tg-theme-hint-color)' }}>
              ×
            </button>
          </div>
          <div className="px-4 pb-6 overflow-y-auto">
            <p className="tg-label mb-2">Default Currency</p>
            <div className="tg-section">
              <button
                onClick={() => setShowCurrencyPicker(true)}
                className="w-full flex items-center justify-between"
                style={{ padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
              >
                <span className="text-sm">Currency</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--tg-theme-button-color)' }}>
                  {group.currency} ›
                </span>
              </button>
            </div>

            <p className="tg-label mt-5 mb-2">Weekly reminder</p>
            <div className="tg-section" style={{ padding: '12px 16px' }}>
              <div className="flex flex-wrap gap-2" role="group" aria-label="Reminder day">
                <button
                  onClick={() => saveReminder(null)}
                  aria-pressed={reminder?.day === null}
                  disabled={!reminder || reminderSaving}
                  style={pillStyle(reminder?.day === null)}
                >
                  Off
                </button>
                {REMINDER_PILLS.map(p => (
                  <button
                    key={p.day}
                    onClick={() => saveReminder(p.day)}
                    aria-pressed={reminder?.day === p.day}
                    disabled={!reminder || reminderSaving}
                    style={pillStyle(reminder?.day === p.day)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--tg-theme-hint-color)' }}>
                {reminder?.day === null || !reminder
                  ? 'Pick a day and the group gets its outstanding balances posted automatically each week.'
                  : `Every ${WEEKDAY_NAMES[reminder.day]} at about ${REMINDER_TIME_LABEL} (Singapore time) the outstanding balances are posted in this group. Skipped when everyone is settled up.`}
                {reminder?.day !== null && reminder?.setBy ? ` Set by ${reminder.setBy}.` : ''}
              </p>
              {reminderError && (
                <p className="text-xs mt-2" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>{reminderError}</p>
              )}
            </div>
          </div>
        </div>
      </div>
      {showCurrencyPicker && (
        <CurrencyPicker
          current={group.currency}
          onSelect={handleCurrencySelect}
          onClose={() => setShowCurrencyPicker(false)}
        />
      )}
    </>
  )
}
