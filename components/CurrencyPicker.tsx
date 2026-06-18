'use client'

const CURRENCIES = [
  { code: 'SGD', name: 'Singapore Dollar' },
  { code: 'USD', name: 'US Dollar' },
  { code: 'EUR', name: 'Euro' },
  { code: 'JPY', name: 'Japanese Yen' },
  { code: 'KRW', name: 'South Korean Won' },
  { code: 'CNY', name: 'Chinese Yuan' },
  { code: 'HKD', name: 'Hong Kong Dollar' },
  { code: 'THB', name: 'Thai Baht' },
  { code: 'MYR', name: 'Malaysian Ringgit' },
  { code: 'IDR', name: 'Indonesian Rupiah' },
  { code: 'PHP', name: 'Philippine Peso' },
  { code: 'VND', name: 'Vietnamese Dong' },
  { code: 'TWD', name: 'Taiwan Dollar' },
  { code: 'INR', name: 'Indian Rupee' },
]

interface Props {
  current: string
  onSelect: (currency: string) => void
  onClose: () => void
  isFirstTime?: boolean
}

export function CurrencyPicker({ current, onSelect, onClose, isFirstTime }: Props) {
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
          maxHeight: '80dvh',
        }}
      >
        {/* Header */}
        <div className="flex justify-between items-center p-4 pb-3">
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

        {/* List */}
        <div className="overflow-y-auto flex-1 px-4 pb-6">
          <div className="tg-section">
            {CURRENCIES.map((c, idx) => {
              const isSelected = c.code === current
              const isLast = idx === CURRENCIES.length - 1
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
          </div>
        </div>
      </div>
    </div>
  )
}
