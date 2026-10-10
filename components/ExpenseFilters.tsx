'use client'

import { useEffect, useRef, useState } from 'react'
import {
  PRESETS, hasRange, isValidYmd, matchPreset, normalizeRange, presetRange, rangeLabel, ymd,
  type DateRange,
} from '@/lib/expense-filter'

const hint = 'var(--tg-theme-hint-color)'
const accent = 'var(--tg-theme-button-color)'

// ── search ──
export function SearchField({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div
      className="flex items-center flex-1 min-w-0"
      style={{ background: 'var(--tg-theme-section-bg-color)', borderRadius: 10, padding: '0 10px', gap: 6, height: 36 }}
    >
      <span aria-hidden style={{ fontSize: 13, color: hint }}>🔍</span>
      <input
        ref={ref}
        type="search"
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); ref.current?.blur() } }}
        placeholder="Search expenses"
        aria-label="Search expenses by description, category or who paid"
        enterKeyHint="search"
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        maxLength={100}
        className="flex-1 min-w-0"
        style={{ background: 'none', border: 'none', outline: 'none', fontSize: 14, color: 'var(--tg-theme-text-color)', WebkitAppearance: 'none' }}
      />
      {value && (
        <button
          type="button"
          onClick={() => { onChange(''); ref.current?.focus() }}
          aria-label="Clear search"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: hint, fontSize: 16, lineHeight: 1, padding: 2 }}
        >
          ✕
        </button>
      )}
    </div>
  )
}

// ── date chip ──
export function DateChip({ range, onOpen, onClear }: { range: DateRange; onOpen: () => void; onClear: () => void }) {
  const active = hasRange(range)
  return (
    <div
      className="flex items-center flex-shrink-0"
      style={{
        height: 36, borderRadius: 10,
        background: active ? 'rgba(36,129,204,0.14)' : 'var(--tg-theme-section-bg-color)',
        color: active ? 'var(--tg-theme-link-color)' : 'var(--tg-theme-text-color)',
      }}
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={active ? `Date filter: ${rangeLabel(range, new Date())}. Change` : 'Filter by date'}
        className="flex items-center"
        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13, fontWeight: 600, gap: 5, padding: active ? '0 4px 0 10px' : '0 10px', height: '100%', maxWidth: 'min(150px, 34vw)', minWidth: 0 }}
      >
        <span aria-hidden>📅</span>
        <span className="truncate" style={{ minWidth: 0 }}>{active ? rangeLabel(range, new Date()) : 'Date'}</span>
      </button>
      {active && (
        <button
          type="button"
          onClick={onClear}
          aria-label="Clear date filter"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 14, padding: '0 10px 0 4px', height: '100%' }}
        >
          ✕
        </button>
      )}
    </div>
  )
}

// ── date sheet ──
type Mode = 'quick' | 'day' | 'range'

export function DateSheet({ range, onApply, onClose }: { range: DateRange; onApply: (r: DateRange) => void; onClose: () => void }) {
  const today = new Date()
  const todayStr = ymd(today)
  const initialMode: Mode = !hasRange(range) || matchPreset(range, today) ? 'quick' : range.from && range.from === range.to ? 'day' : 'range'
  const [mode, setMode] = useState<Mode>(initialMode)
  const [day, setDay] = useState(range.from && range.from === range.to ? range.from : todayStr)
  const [from, setFrom] = useState(range.from ?? '')
  const [to, setTo] = useState(range.to ?? '')
  const preset = hasRange(range) ? matchPreset(range, today) : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const rangeValid = (isValidYmd(from) || from === '') && (isValidYmd(to) || to === '') && (from !== '' || to !== '')
  const dayValid = isValidYmd(day)

  const apply = () => {
    if (mode === 'day' && dayValid) onApply({ from: day, to: day })
    else if (mode === 'range' && rangeValid) onApply(normalizeRange({ from: from || null, to: to || null }))
  }

  const field = (label: string, value: string, set: (v: string) => void, id: string) => (
    <label htmlFor={id} className="flex-1 min-w-0" style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: hint, margin: '0 4px 4px' }}>{label}</span>
      <input
        id={id}
        type="date"
        value={value}
        onChange={e => set(e.target.value)}
        className="tg-input"
        style={{ background: 'var(--tg-theme-secondary-bg-color)', borderRadius: 11, padding: '11px 12px', width: '100%', fontSize: 15 }}
      />
    </label>
  )

  return (
    <div className="fixed inset-0 flex items-end justify-center z-50" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={onClose}>
      <div
        role="dialog"
        aria-label="Filter by date"
        className="w-full"
        style={{ background: 'var(--tg-theme-bg-color)', borderRadius: '18px 18px 0 0', padding: '14px 16px calc(16px + env(safe-area-inset-bottom, 0px))', maxWidth: 560 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold text-base">Filter by date</p>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: hint, fontSize: 20, lineHeight: 1 }}>✕</button>
        </div>

        <div role="tablist" className="flex" style={{ gap: 2, background: 'var(--tg-theme-secondary-bg-color)', borderRadius: 999, padding: 3, marginBottom: 12 }}>
          {([['quick', 'Quick'], ['day', 'Day'], ['range', 'Range']] as const).map(([m, label]) => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              className="flex-1 text-sm"
              style={{
                border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 4px',
                fontWeight: mode === m ? 600 : 500,
                background: mode === m ? 'var(--tg-theme-bg-color)' : 'transparent',
                color: mode === m ? 'var(--tg-theme-text-color)' : hint,
                boxShadow: mode === m ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {mode === 'quick' && (
          <div className="flex flex-wrap gap-2 mb-1" role="group" aria-label="Quick ranges">
            {PRESETS.map(p => (
              <button
                key={p.key}
                onClick={() => onApply(presetRange(p.key, today))}
                aria-pressed={preset === p.key}
                className="text-sm font-semibold"
                style={{
                  border: 'none', cursor: 'pointer', borderRadius: 999, padding: '8px 14px',
                  background: preset === p.key ? 'rgba(36,129,204,0.14)' : 'var(--tg-theme-secondary-bg-color)',
                  color: preset === p.key ? 'var(--tg-theme-link-color)' : 'var(--tg-theme-text-color)',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {mode === 'day' && (
          <>
            <div className="flex">{field('Date', day, setDay, 'date-filter-day')}</div>
            <p className="text-xs mt-2 px-1" style={{ color: hint }}>Shows expenses dated exactly this day.</p>
          </>
        )}

        {mode === 'range' && (
          <>
            <div className="flex gap-2">
              {field('From', from, setFrom, 'date-filter-from')}
              {field('To', to, setTo, 'date-filter-to')}
            </div>
            <p className="text-xs mt-2 px-1" style={{ color: hint }}>Leave one end empty for “since” or “until”.</p>
          </>
        )}

        <div className="flex gap-2 mt-4">
          <button
            onClick={() => onApply({ from: null, to: null })}
            disabled={!hasRange(range)}
            className="flex-1 text-sm font-semibold"
            style={{ border: 'none', borderRadius: 11, padding: 12, cursor: hasRange(range) ? 'pointer' : 'default', background: 'var(--tg-theme-secondary-bg-color)', color: 'var(--tg-theme-text-color)', opacity: hasRange(range) ? 1 : 0.5 }}
          >
            Clear
          </button>
          {mode !== 'quick' && (
            <button
              onClick={apply}
              disabled={mode === 'day' ? !dayValid : !rangeValid}
              className="flex-1 text-sm font-semibold"
              style={{ border: 'none', borderRadius: 11, padding: 12, cursor: 'pointer', background: accent, color: 'var(--tg-theme-button-text-color)', opacity: (mode === 'day' ? dayValid : rangeValid) ? 1 : 0.5 }}
            >
              Apply
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
