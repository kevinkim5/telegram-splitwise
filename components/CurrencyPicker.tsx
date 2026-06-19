'use client'

// SGD first, then all others alphabetically by code
export const CURRENCIES = [
  { code: 'SGD', flag: '🇸🇬', name: 'Singapore Dollar' },
  { code: 'CNY', flag: '🇨🇳', name: 'Chinese Yuan' },
  { code: 'EUR', flag: '🇪🇺', name: 'Euro' },
  { code: 'HKD', flag: '🇭🇰', name: 'Hong Kong Dollar' },
  { code: 'IDR', flag: '🇮🇩', name: 'Indonesian Rupiah' },
  { code: 'INR', flag: '🇮🇳', name: 'Indian Rupee' },
  { code: 'JPY', flag: '🇯🇵', name: 'Japanese Yen' },
  { code: 'KRW', flag: '🇰🇷', name: 'South Korean Won' },
  { code: 'MYR', flag: '🇲🇾', name: 'Malaysian Ringgit' },
  { code: 'PHP', flag: '🇵🇭', name: 'Philippine Peso' },
  { code: 'THB', flag: '🇹🇭', name: 'Thai Baht' },
  { code: 'TWD', flag: '🇹🇼', name: 'Taiwan Dollar' },
  { code: 'USD', flag: '🇺🇸', name: 'US Dollar' },
  { code: 'VND', flag: '🇻🇳', name: 'Vietnamese Dong' },
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
      style={{ background: 'var(--overlay)' }}
      onClick={e => { if (!isFirstTime && e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full rounded-t-2xl flex flex-col"
        style={{ background: 'var(--tg-theme-bg-color)', maxHeight: '80dvh' }}
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
                  <span className="text-sm flex items-center gap-2">
                    <span className="text-lg">{c.flag}</span>
                    <span>
                      <span className="font-semibold">{c.code}</span>
                      <span style={{ color: 'var(--tg-theme-hint-color)' }}> — {c.name}</span>
                    </span>
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
