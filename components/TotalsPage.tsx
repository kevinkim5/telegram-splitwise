'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAppContext } from '@/components/AppProvider'
import { useShowSkeleton } from '@/lib/use-show-skeleton'
import { CONVERT_TO } from '@/lib/convert'
import { useRates } from '@/lib/use-rates'
import { combineTotals } from '@/lib/totals-all'

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

const ALL = 'ALL'

function SkeletonTotals() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        {[0, 1].map(i => (
          <div key={i} className="rounded-2xl p-4 flex flex-col gap-2" style={{ background: 'var(--tg-theme-section-bg-color)' }}>
            <div className="skeleton" style={{ height: 10, width: '60%', borderRadius: 3 }} />
            <div className="skeleton" style={{ height: 20, width: '76%', borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 10, width: '44%', borderRadius: 3 }} />
          </div>
        ))}
      </div>
      <div className="skeleton" style={{ height: 11, width: 80, borderRadius: 3 }} />
      <div className="tg-section">
        {[76, 54, 38, 22].map((barW, i) => (
          <div key={i} style={{ padding: '12px 16px', borderBottom: i < 3 ? '0.5px solid rgba(0,0,0,0.08)' : 'none' }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5">
                <div className="skeleton" style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0 }} />
                <div className="flex flex-col gap-1.5">
                  <div className="skeleton" style={{ height: 13, width: 70, borderRadius: 4 }} />
                  <div className="skeleton" style={{ height: 10, width: 106, borderRadius: 3 }} />
                </div>
              </div>
              <div className="skeleton" style={{ height: 13, width: 62, borderRadius: 4 }} />
            </div>
            <div className="skeleton" style={{ height: 4, borderRadius: 2, width: `${barW}%` }} />
          </div>
        ))}
      </div>
    </div>
  )
}

export function TotalsPage() {
  const { chatId, group, apiHeaders } = useAppContext()
  const [data, setData] = useState<TotalsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCurrency, setSelectedCurrency] = useState<string | null>(null)
  const showSkeleton = useShowSkeleton(loading)

  const fetchTotals = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/groups/${chatId}/totals`, { headers: apiHeaders })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const d: TotalsData = await res.json()
      setData(d)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [chatId, apiHeaders])

  useEffect(() => { fetchTotals() }, [fetchTotals])

  const isMultiCurrency = (data?.summary.length ?? 0) > 1
  // With several currencies the page opens on "All": everything converted into CONVERT_TO
  const activeCurrency = selectedCurrency ?? (isMultiCurrency ? ALL : data?.summary[0]?.currency) ?? group.currency
  const showingAll = isMultiCurrency && activeCurrency === ALL
  const { rates, date: ratesDate, failed: ratesFailed, retry: retryRates } =
    useRates(isMultiCurrency ? data!.summary.map(s => s.currency) : [])
  const combined = showingAll && data ? combineTotals(data.summary, data.by_category, rates) : null
  const ratesPending = showingAll && !rates && !ratesFailed && (data?.summary.some(s => s.currency !== CONVERT_TO) ?? false)

  // What the cards and category list show: one currency, or the converted "All"
  const view = (() => {
    if (!data) return null
    if (showingAll) {
      if (!combined || !combined.ok) return null
      return {
        label: `≈ ${CONVERT_TO}`,
        group_total: combined.group_total, my_total: combined.my_total, count: combined.count,
        cats: combined.categories,
      }
    }
    const sum = data.summary.find(x => x.currency === activeCurrency)
    if (!sum) return null
    return {
      label: sum.currency,
      group_total: sum.group_total, my_total: sum.my_total, count: sum.count,
      cats: data.by_category.filter(c => c.currency === activeCurrency),
    }
  })()

  return (
    <div className="flex-1 min-h-0 overflow-y-auto">
      <div className="px-4 pt-3 pb-fab flex flex-col gap-4">

        {showSkeleton && <SkeletonTotals />}

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
                {[ALL, ...data.summary.map(s => s.currency)].map(cur => ({ currency: cur })).map(s => (
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
                    {s.currency === ALL ? `All · ${CONVERT_TO}` : s.currency}
                  </button>
                ))}
              </div>
            )}

            {/* "All" needs rates. While they load show a skeleton; only say something is wrong once we
                know: the request failed, or it worked but a currency has no rate */}
            {showingAll && ratesPending && <SkeletonTotals />}
            {showingAll && !ratesPending && (ratesFailed || (rates && combined && !combined.ok)) && (
              <div className="flex items-center justify-between gap-3 px-1 text-xs" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
                <p>
                  {rates && combined && !combined.ok
                    ? `No exchange rate for ${combined.missing.join(', ')}, so there is no combined total. Pick a currency instead.`
                    : "Couldn't load exchange rates, so there is no combined total. Pick a currency instead."}
                </p>
                {!rates && (
                  <button
                    onClick={retryRates}
                    className="font-semibold flex-shrink-0"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg-theme-link-color)' }}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
            {showingAll && view && (
              <p className="text-xs px-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
                ECB rates{ratesDate ? ` · ${new Date(`${ratesDate}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              </p>
            )}

            {/* Summary cards */}
            {view && (
              <div className="grid grid-cols-2 gap-3">
                <div
                  className="rounded-2xl p-4 flex flex-col gap-1"
                  style={{ background: 'var(--tg-theme-section-bg-color)' }}
                >
                  <p className="text-xs font-medium" style={{ color: 'var(--tg-theme-hint-color)' }}>
                    Group total
                  </p>
                  <p className="font-bold leading-tight" style={{ fontSize: '18px' }}>
                    {view.label} {view.group_total.toFixed(2)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
                    {view.count} expense{view.count !== 1 ? 's' : ''}
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
                    {view.label} {view.my_total.toFixed(2)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
                    {view.group_total > 0
                      ? `${((view.my_total / view.group_total) * 100).toFixed(0)}% of total`
                      : '—'}
                  </p>
                </div>
              </div>
            )}

            {/* Category breakdown */}
            {view && view.cats.length > 0 && (
              <>
                <p className="tg-label">By category</p>
                <div className="tg-section">
                  {view.cats.map((cat, idx) => {
                    const isLast = idx === view.cats.length - 1
                    const barPct = view.group_total > 0
                      ? (cat.group_total / view.group_total) * 100
                      : 0
                    const emoji = cat.category ? cat.category.split(' ')[0] : '🧾'
                    const label = cat.category
                      ? cat.category.split(' ').slice(1).join(' ') || cat.category
                      : 'Other'

                    return (
                      <div
                        key={`${view.label}-${cat.category ?? '_null'}`}
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
                                {cat.count} expense{cat.count !== 1 ? 's' : ''} · you {view.label} {cat.my_total.toFixed(2)}
                              </p>
                            </div>
                          </div>
                          <p className="text-sm font-bold flex-shrink-0">
                            {view.label} {cat.group_total.toFixed(2)}
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
