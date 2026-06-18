'use client'

import { useState } from 'react'

const CURRENCIES = [
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'GBP', name: 'British Pound' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'CAD', name: 'Canadian Dollar' },
  { code: 'AUD', name: 'Australian Dollar' },
  { code: 'CHF', name: 'Swiss Franc' },
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'INR', name: 'Indian Rupee' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'VND', name: 'Vietnamese Dong' },
  { code: 'BRL', name: 'Brazilian Real' },
  { code: 'MXN', name: 'Mexican Peso' },
  { code: 'NZD', name: 'New Zealand Dollar' },
  { code: 'SEK', name: 'Swedish Krona' },
  { code: 'NOK', name: 'Norwegian Krone' },
  { code: 'DKK', name: 'Danish Krone' },
  { code: 'AED', name: 'UAE Dirham' },
  { code: 'SAR', name: 'Saudi Riyal' },
]

interface Props {
  current: string
  onSelect: (currency: string) => void
  onClose: () => void
  isFirstTime?: boolean
}

export function CurrencyPicker({ current, onSelect, onClose, isFirstTime }: Props) {
  const [search, setSearch] = useState('')

  const filtered = CURRENCIES.filter(
    c =>
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      c.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div
      className="fixed inset-0 flex items-end justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={e => { if (!isFirstTime && e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full rounded-t-2xl flex flex-col"
        style={{
          background: 'var(--tg-theme-bg-color)',
          maxHeight: '80vh',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 pb-2">
          <div>
            <h2 className="text-lg font-bold">
              {isFirstTime ? 'Set Group Currency' : 'Change Currency'}
            </h2>
            {isFirstTime && (
              <p className="text-xs mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
                All expenses in this group will use this currency
              </p>
            )}
          </div>
          {!isFirstTime && (
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: 'var(--tg-theme-hint-color)' }}
            >
              ×
            </button>
          )}
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="tg-section">
            <input
              className="tg-input"
              placeholder="Search currency…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
          </div>
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1 px-4 pb-6">
          <div className="tg-section">
            {filtered.map((c, idx) => {
              const isSelected = c.code === current
              const isLast = idx === filtered.length - 1
              return (
                <button
                  key={c.code}
                  onClick={() => onSelect(c.code)}
                  className="tg-list-item w-full flex justify-between items-center text-left cursor-pointer"
                  style={{
                    background: 'none',
                    border: 'none',
                    borderBottom: isLast ? 'none' : undefined,
                  }}
                >
                  <span className="text-sm">
                    <span className="font-semibold">{c.code}</span>
                    <span style={{ color: 'var(--tg-theme-hint-color)' }}> — {c.name}</span>
                  </span>
                  {isSelected && (
                    <span style={{ color: 'var(--tg-theme-button-color)' }} className="text-lg">✓</span>
                  )}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="p-4 text-center text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
                No currencies found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
