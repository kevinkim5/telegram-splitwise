'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppContext } from '@/components/AppProvider'

interface CurrencySummary {
  currency: string
  group_total: number
  my_total: number
  count: number
}

interface CategoryEntry {
  currency: string
  category: string | null
  group_total: number
  my_total: number
  count: number
}

interface TotalsData {
  group_currency: string
  summary: CurrencySummary[]
  by_category: CategoryEntry[]
}

export function TotalsPage() {
  const router = useRouter()
  const { chatId, group, apiHeaders } = useAppContext()
  const [data, setData] = useState<TotalsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null)

  const fetchTotals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/groups/${chatId}/totals`, { headers: apiHeaders })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d: TotalsData = await res.json()
      setData(d)
      if (!selectedCurrency && d.summary.length > 0) {
        setSelectedCurrency(d.summary[0].currency)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [chatId, apiHeaders]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { fetchTotals() }, [fetchTotals])

  const activeCurrency = selectedCurrency ?? data?.summary[0]?.currency ?? group.currency
  const activeSummary = data?.summary.find(s => s.currency === activeCurrency)
  const activeCats = (data?.by_category ?? []).filter(c => c.currency === activeCurrency)
  const isMultiCurrency = (data?.summary.length ?? 0) > 1

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-4 pt-4 pb-8 flex flex-col gap-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/?chatId=${chatId}`)}
            className="text-sm font-medium"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg-theme-link-color)' }}
          >
            ← Back
          </button>
          <h1 className="font-bold text-lg">Totals</h1>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex justify-center py-16">
            <p style={{ color: 'var(--tg-theme-hint-color)' }}>Loading…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="py-4 text-center text-sm" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && (!data || data.summary.length === 0) && (
          <div className="flex flex-col items-center py-16 gap-3">
            <div className="text-5xl">📊</div>
            <p className="font-medium">No expenses yet</p>
            <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
              Add expenses to see your spending breakdown
            </p>
          </div>
        )}

        {data && data.summary.length > 0 && (
          <>
            {/* Currency pills (multi-currency only) */}
            {isMultiCurrency && (
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {data.summary.map(s => (
                  <button
                    key={s.currency}
                    onClick={() => setSelectedCurrency(s.currency)}
                    className="px-3 py-1.5 rounded-full text-sm font-semibold flex-shrink-0"
                    style={{
                      background: s.currency === activeCurrency
                        ? 'var(--tg-theme-button-color)'
                        : 'var(--tg-theme-secondary-bg-color)',
                      color: s.currency === activeCurrency
                        ? 'var(--tg-theme-button-text-color)'
                        : 'var(--tg-theme-text-color)',
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    {s.currency}
                  </button>
                ))}
              </div>
            )}

            {/* Summary cards */}
            {activeSummary && (
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="rounded-2xl p-4 flex flex-col gap-1"
                  style={{ background: 'var(--tg-theme-section-bg-color)' }}
                >
                  <p className="text-xs font-medium" style={{ color: 'var(--tg-theme-hint-color)' }}>
                    Group total
                  </p>
                  <p className="font-bold leading-tight" style={{ fontSize: '18px' }}>
                    {activeSummary.currency} {activeSummary.group_total.toFixed(2)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
                    {activeSummary.count} expense{activeSummary.count !== 1 ? 's' : ''}
                  </p>
                </div>

                <div
                  className="rounded-2xl p-4 flex flex-col gap-1"
                  style={{ background: 'var(--tg-theme-section-bg-color)' }}
                >
                  <p className="text-xs font-medium" style={{ color: 'var(--tg-theme-hint-color)' }}>
                    Your share
                  </p>
                  <p
                    className="font-bold leading-tight"
                    style={{ fontSize: '18px', color: 'var(--tg-theme-button-color)' }}
                  >
                    {activeSummary.currency} {activeSummary.my_total.toFixed(2)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
                    {activeSummary.group_total > 0
                      ? `${((activeSummary.my_total / activeSummary.group_total) * 100).toFixed(0)}% of total`
                      : '—'}
                  </p>
                </div>
              </div>
            )}

            {/* Category breakdown */}
            {activeCats.length > 0 && (
              <>
                <p className="tg-label">By category</p>
                <div className="tg-section">
                  {activeCats.map((cat, idx) => {
                    const isLast = idx === activeCats.length - 1
                    const barPct = activeSummary && activeSummary.group_total > 0
                      ? (cat.group_total / activeSummary.group_total) * 100
                      : 0
                    const emoji = cat.category ? cat.category.split(' ')[0] : '🧾'
                    const label = cat.category
                      ? cat.category.split(' ').slice(1).join(' ') || cat.category
                      : 'Other'

                    return (
                      <div
                        key={`${cat.currency}-${cat.category ?? '_null'}`}
                        style={{
                          padding: '12px 16px',
                          borderBottom: isLast ? 'none' : '0.5px solid rgba(0,0,0,0.08)',
                        }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
                            <span style={{ fontSize: '22px', lineHeight: 1, flexShrink: 0 }}>{emoji}</span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">{label}</p>
                              <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
                                {cat.count} expense{cat.count !== 1 ? 's' : ''} · you {cat.currency} {cat.my_total.toFixed(2)}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm font-bold flex-shrink-0">
                            {cat.currency} {cat.group_total.toFixed(2)}
                          </p>
                        </div>

                        {/* Proportional bar */}
                        <div style={{ height: 4, borderRadius: 2, background: 'var(--tg-theme-secondary-bg-color)', overflow: 'hidden' }}>
                          <div
                            style={{
                              height: '100%',
                              borderRadius: 2,
                              width: `${barPct}%`,
                              background: 'var(--tg-theme-button-color)',
                              transition: 'width 0.4s ease',
                            }}
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}
