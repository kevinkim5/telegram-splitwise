'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAppContext } from '@/components/AppProvider'
import { useGroupData } from '@/components/GroupData'
import { useShowSkeleton } from '@/lib/use-show-skeleton'
import type { SimplifiedDebt } from '@/types'
import type { NamedBalance } from '@/lib/balances'
import { CONVERT_TO, sumConverted, type CurrencyLine } from '@/lib/convert'
import { useRates } from '@/lib/use-rates'
import { buildPayments, checkAmount, groupDebtsByPerson, type Payment, type SettleGroup } from '@/lib/settle'
import { CURRENCIES } from '@/components/CurrencyPicker'

interface BalancesData {
  balances: NamedBalance[]
  balances_by_currency: Record<string, NamedBalance[]>
  simplified_debts: SimplifiedDebt[]
}

interface SettleSheetProps {
  group: SettleGroup
  rates: Record<string, number> | null // exchange rates to SGD, when loaded, for the on-screen total
  onClose: () => void
  onConfirm: (payments: Payment[]) => Promise<void>
}

// Settle with one person: one field per currency, pre-filled with the full amount. Empty = skip.
function SettleSheet({ group, rates, onClose, onConfirm }: SettleSheetProps) {
  const { entries, personName } = group
  const [raws, setRaws] = useState<Record<string, string>>(
    () => Object.fromEntries(entries.map(e => [e.key, e.owed.toFixed(2)]))
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const hasPay = entries.some(e => e.direction === 'pay')
  const hasReceive = entries.some(e => e.direction === 'receive')
  const checks = entries.map(e => checkAmount(e, raws[e.key] ?? ''))
  const anyError = checks.some(c => c.status === 'error')
  const anyFilled = checks.some(c => c.status === 'ok')

  // On-screen convenience only (not stored): the SGD total of what is being recorded, at today's
  // rates. Pay amounts count positive, receive amounts negative, so mixed directions show a net.
  const [fetchedRates, setFetchedRates] = useState<Record<string, number> | null>(null)
  const foreign = Array.from(new Set(entries.map(e => e.currency).filter(c => c !== CONVERT_TO)))
  const foreignKey = foreign.join(',')
  useEffect(() => {
    if (rates || !foreignKey) return
    let cancelled = false
    fetch(`/api/rates?from=${foreignKey}&to=${CONVERT_TO}`)
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (!cancelled && j?.rates) setFetchedRates(j.rates) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [rates, foreignKey])
  const activeRates = rates ?? fetchedRates

  const filled = entries.flatMap((e, i) => {
    const c = checks[i]
    return c && c.status === 'ok' ? [{ entry: e, amount: c.amount }] : []
  })
  const converted = activeRates && filled.some(f => f.entry.currency !== CONVERT_TO)
    ? sumConverted(
        filled.map(f => ({ currency: f.entry.currency, net: f.entry.direction === 'pay' ? f.amount : -f.amount })),
        activeRates, CONVERT_TO)
    : null
  const showTotal = !!converted && converted.missing.length === 0

  const subtitle = hasPay && hasReceive
    ? `Record what has been paid between you and ${personName}.`
    : hasReceive
      ? `${personName} pays you. Record what you've received.`
      : `You pay ${personName}. Leave a field empty to skip that currency.`

  const handleSubmit = async () => {
    const built = buildPayments(entries, raws)
    if (!built.ok) { setError(built.error); return }
    setSubmitting(true)
    setError(null)
    try {
      await onConfirm(built.payments)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const renderField = (e: (typeof entries)[number]) => {
    const i = entries.indexOf(e)
    const check = checks[i]!
    const raw = raws[e.key] ?? ''
    const isFull = check.status === 'ok' && Math.abs(check.amount - e.owed) < 0.005
    const left = check.status === 'ok' && !isFull ? Math.max(0, e.owed - check.amount) : null
    const flag = CURRENCIES.find(c => c.code === e.currency)?.flag ?? ''
    return (
      <div key={e.key}>
        <div
          className="flex items-center gap-3"
          style={{
            background: check.status === 'skip' ? 'transparent' : 'var(--tg-theme-secondary-bg-color)',
            border: `1.5px ${check.status === 'skip' ? 'dashed' : 'solid'} ${
              check.status === 'error' ? 'var(--tg-theme-destructive-text-color, #ff3b30)' : check.status === 'skip' ? 'rgba(128,128,128,0.45)' : 'transparent'}`,
            borderRadius: 12, padding: '9px 12px', marginBottom: check.status === 'error' ? 4 : 8,
          }}
        >
          <span className="text-sm font-bold flex-shrink-0" style={{ minWidth: 56 }}>{flag} {e.currency}</span>
          <div className="flex-1 min-w-0">
            <input
              aria-label={`${e.currency} amount`}
              type="number" inputMode="decimal" step="0.01" min="0"
              value={raw}
              placeholder="skip"
              disabled={submitting}
              onChange={ev => { setRaws(prev => ({ ...prev, [e.key]: ev.target.value })); setError(null) }}
              style={{ width: '100%', textAlign: 'right', fontSize: 18, fontWeight: 600, background: 'transparent', border: 'none', outline: 'none', color: 'var(--tg-theme-text-color)' }}
            />
            <p className="text-right" style={{ fontSize: 11, color: 'var(--tg-theme-hint-color)' }}>
              {left !== null ? `${e.currency} ${left.toFixed(2)} left after` : `of ${e.currency} ${e.owed.toFixed(2)} owed`}
            </p>
          </div>
          {!isFull && !submitting && (
            <button
              type="button"
              onClick={() => { setRaws(prev => ({ ...prev, [e.key]: e.owed.toFixed(2) })); setError(null) }}
              style={{ fontSize: 11, fontWeight: 700, color: 'var(--tg-theme-link-color)', background: 'rgba(36,129,204,0.12)', border: 'none', borderRadius: 999, padding: '3px 9px', cursor: 'pointer', flexShrink: 0 }}
            >
              Full
            </button>
          )}
        </div>
        {check.status === 'error' && (
          <p className="text-xs mb-2 px-1" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>{check.message}</p>
        )}
      </div>
    )
  }

  const heading = (text: string, color: string) => (
    <p className="text-xs font-bold uppercase mt-3 mb-1.5 px-0.5" style={{ color, letterSpacing: '0.06em' }}>{text}</p>
  )

  return (
    <div
      className="fixed inset-0 flex items-end justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget && !submitting) onClose() }}
    >
      <div className="w-full rounded-t-2xl p-5 flex flex-col"
        style={{ background: 'var(--tg-theme-bg-color)', maxHeight: '85dvh', overflowY: 'auto' }}>
        <div className="flex justify-between items-center mb-1">
          <h2 className="text-lg font-bold">Settle with {personName}</h2>
          <button onClick={onClose} disabled={submitting} aria-label="Close"
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: 'var(--tg-theme-hint-color)', opacity: submitting ? 0.3 : 1 }}>
            ×
          </button>
        </div>
        <p className="text-sm mb-3" style={{ color: 'var(--tg-theme-hint-color)' }}>{subtitle}</p>

        {error && (
          <div className="mb-3 p-3 rounded-xl text-sm" role="alert"
            style={{ background: 'rgba(255,59,48,0.1)', color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
            {error}
          </div>
        )}

        {hasPay && hasReceive ? (
          <>
            {heading(`You pay ${personName}`, 'var(--tg-theme-destructive-text-color, #ff3b30)')}
            {entries.filter(e => e.direction === 'pay').map(renderField)}
            {heading(`${personName} pays you`, 'var(--tg-theme-button-color)')}
            {entries.filter(e => e.direction === 'receive').map(renderField)}
          </>
        ) : entries.map(renderField)}

        {showTotal && converted && (
          <div className="flex justify-between text-sm pt-2.5 pb-1 px-1" style={{ borderTop: '0.5px solid rgba(128,128,128,0.25)' }}>
            <div>
              <p className="font-bold">{converted.total < 0 ? 'Total you receive' : 'Total you pay'}</p>
              <p style={{ fontSize: 11, color: 'var(--tg-theme-hint-color)' }}>at today&apos;s rates</p>
            </div>
            <p className="font-bold">≈ {CONVERT_TO} {Math.abs(converted.total).toFixed(2)}</p>
          </div>
        )}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || anyError || !anyFilled}
          className="tg-btn mt-3"
          style={{ opacity: submitting ? 0.7 : 1, ...(anyError || !anyFilled ? { background: '#c9c9cf', color: '#fff', cursor: 'default' } : {}) }}
        >
          {submitting ? 'Recording…' : entries.length > 1 ? 'Record payments' : 'Record payment'}
        </button>
      </div>
    </div>
  )
}

function SkeletonBalances() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="skeleton" style={{ height: 11, width: 24, borderRadius: 3, margin: '0 16px 8px' }} />
        <div className="tg-section">
          <div className="tg-list-item flex items-center justify-between">
            <div className="skeleton" style={{ height: 14, width: '42%', borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 12, width: '28%', borderRadius: 4 }} />
          </div>
          <div className="tg-list-item flex items-center justify-between" style={{ borderBottom: 'none' }}>
            <div className="flex-1 pr-4">
              <div className="skeleton" style={{ height: 12, width: '50%', borderRadius: 3, marginBottom: 6 }} />
              <div className="skeleton" style={{ height: 15, width: '32%', borderRadius: 4 }} />
            </div>
            <div className="skeleton" style={{ height: 30, width: 58, borderRadius: 10 }} />
          </div>
        </div>
      </div>
      <div>
        <div className="skeleton" style={{ height: 11, width: 40, borderRadius: 3, margin: '0 16px 8px' }} />
        <div className="tg-section">
          {[0, 1].map(i => (
            <div key={i} className="tg-list-item flex items-center justify-between" style={{ borderBottom: i === 1 ? 'none' : undefined }}>
              <div className="skeleton" style={{ height: 14, width: '44%', borderRadius: 4 }} />
              <div className="skeleton" style={{ height: 13, width: '22%', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Balances can be converted to this currency on demand. Independent of the group's
// default currency, which only pre-selects the currency when adding an expense.

export function BalancesPage() {
  const { chatId, currentMember, apiHeaders } = useAppContext()
  // One shared copy of the balances (the header's "You owe" line uses it too)
  const { balances: data, balancesLoading: loading, balancesError: error, refreshBalances: loadBalances } = useGroupData()
  const showSkeleton = useShowSkeleton(loading)
  const [settleTarget, setSettleTarget] = useState<SettleGroup | null>(null)
  const [expandedMembers, setExpandedMembers] = useState<Set<number>>(new Set())

  const [notifying, setNotifying] = useState(false)
  const [notifyError, setNotifyError] = useState<string | null>(null)
  const [notifySent, setNotifySent] = useState(false)

  // Currency conversion
  const foreignCurrencies = data
    ? Object.entries(data.balances_by_currency)
        .filter(([cur, bals]) => cur !== CONVERT_TO && bals.some(b => Math.abs(b.net_amount) > 0.005))
        .map(([cur]) => cur)
    : []
  // Rates load on their own once there is a foreign currency; everything is then shown converted
  // (until then, or if they can't load, in the original currencies)
  const { rates: directRates, date: ratesDate, failed: ratesFailed, retry: retryRates } = useRates(foreignCurrencies)
  const showConverted = directRates !== null

  const handleNotify = async () => {
    setNotifying(true)
    setNotifyError(null)
    setNotifySent(false)
    try {
      const res = await fetch(`/api/groups/${chatId}/notify-balances`, {
        method: 'POST',
        headers: apiHeaders,
      })
      if (!res.ok) {
        const d = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(d.error ?? `HTTP ${res.status}`)
      }
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')
      setNotifySent(true)
      setTimeout(() => setNotifySent(false), 3000)
    } catch (e) {
      setNotifyError(String(e))
    } finally {
      setNotifying(false)
    }
  }


  // Record the chosen payments (one per currency) in a single request: all saved or none.
  const handleRecord = async (payments: Payment[]) => {
    const res = await fetch(`/api/groups/${chatId}/settlements/batch`, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({ settlements: payments }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      if (res.status === 409) loadBalances() // balances changed under us: refresh so reopening shows the truth
      throw new Error(
        res.status >= 500 || !d.error
          ? "Couldn't record the payments, so nothing was saved. Check your connection and try again."
          : d.error,
      )
    }
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')
    setSettleTarget(null)
    loadBalances()
  }

  const toggleMember = (id: number) => {
    setExpandedMembers(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // My debts from simplified_debts
  const myDebts = data?.simplified_debts.filter(
    d => d.from_member_id === currentMember.id || d.to_member_id === currentMember.id
  ) ?? []

  // The same debts, one group per person you owe or are owed by
  const settleGroups = groupDebtsByPerson(data?.simplified_debts ?? [], currentMember.id)

  // Other members (not me)
  const otherMemberIds = data
    ? [...new Set(data.balances.filter(b => b.member_id !== currentMember.id).map(b => b.member_id))]
    : []

  const allSettled = data
    && data.simplified_debts.length === 0
    && Object.values(data.balances_by_currency).every(bals =>
        bals.every(b => Math.abs(b.net_amount) < 0.01)
      )

  // Per-currency lines for a given member
  const memberCurrencyLines = (memberId: number) =>
    data
      ? Object.entries(data.balances_by_currency).flatMap(([cur, bals]) => {
          const b = bals.find(x => x.member_id === memberId)
          return b && Math.abs(b.net_amount) > 0.005 ? [{ currency: cur, net: b.net_amount }] : []
        })
      : []

  // All simplified debts involving a given member
  const memberDebts = (memberId: number) =>
    (data?.simplified_debts ?? []).filter(
      d => d.from_member_id === memberId || d.to_member_id === memberId
    )

  const memberName = (id: number) =>
    data?.balances.find(b => b.member_id === id)?.member_name ?? 'Unknown'

  // Convert an amount to CONVERT_TO. Null when no rate is available.
  const toTarget = (amount: number, fromCurrency: string): number | null => {
    if (fromCurrency === CONVERT_TO) return amount
    const rate = directRates?.[fromCurrency]
    return rate ? Math.round(amount * rate * 100) / 100 : null
  }

  const approxStr = (amount: number, currency: string): string | null => {
    if (!showConverted || currency === CONVERT_TO) return null
    const v = toTarget(amount, currency)
    return v !== null ? `≈ ${CONVERT_TO} ${v.toFixed(2)}` : null
  }

  // One person's balances across all currencies as a single CONVERT_TO figure (netted), plus the
  // original amounts it is made of. Null unless converted view is on and at least one rate applied.
  const combined = (lines: CurrencyLine[]) => {
    if (!showConverted || lines.length === 0) return null
    const sum = sumConverted(lines, directRates, CONVERT_TO)
    // A total with a currency left out would be wrong, so unless every currency converted we keep
    // the original per-currency lines (the banner says which currency has no rate).
    if (!sum.usedAny || sum.missing.length > 0) return null
    return { total: sum.total, even: Math.abs(sum.total) < 0.005, approx: lines.some(l => l.currency !== CONVERT_TO) }
  }

  // Currencies with a balance that the rate service had no rate for
  const unrated = showConverted ? foreignCurrencies.filter(c => !directRates?.[c]) : []

  const formatRatesDate = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-fab">
      {/* One row: the rates note on the left, Notify Group on the right */}
      {(() => {
        const showRatesInfo = !!data && !allSettled && foreignCurrencies.length > 0 && (showConverted || ratesFailed)
        const showNotify = !!data && !allSettled
        if (!showRatesInfo && !showNotify) return null
        return (
          <div className="flex items-center justify-between gap-3 mb-4 px-1">
            <div className="min-w-0 text-xs leading-snug" style={{ color: 'var(--tg-theme-hint-color)' }}>
              {showRatesInfo && (showConverted ? (
                <p>
                  ECB rates{ratesDate ? ` · ${formatRatesDate(ratesDate)}` : ''}
                  {unrated.length ? ` · no rate for ${unrated.join(', ')}` : ''}
                </p>
              ) : (
                <p>
                  <span style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>Couldn&apos;t load exchange rates. </span>
                  <button
                    onClick={retryRates}
                    className="font-semibold"
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--tg-theme-link-color)', fontSize: 'inherit' }}
                  >
                    Retry
                  </button>
                </p>
              ))}
            </div>
            {showNotify && (
              <button
                onClick={handleNotify}
                disabled={notifying}
                className="text-sm font-semibold px-3 py-1.5 rounded-xl flex-shrink-0"
                style={{
                  background: notifySent ? 'rgba(52,199,89,0.15)' : 'var(--tg-theme-button-color)',
                  border: 'none',
                  cursor: notifying ? 'default' : 'pointer',
                  color: notifySent ? '#34c759' : 'var(--tg-theme-button-text-color)',
                  opacity: notifying ? 0.6 : 1,
                }}
              >
                {notifying ? 'Sending…' : notifySent ? 'Sent ✓' : 'Notify Group'}
              </button>
            )}
          </div>
        )
      })()}

      {/* Inline error rows */}
      {notifyError && (
        <p className="text-xs mb-3" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
          {notifyError}
        </p>
      )}

      {showSkeleton && <SkeletonBalances />}
      {error && (
        <div className="py-4 text-center text-sm" style={{ color: 'var(--tg-theme-destructive-text-color)' }}>
          {error}
        </div>
      )}

      {data && allSettled && (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="text-5xl">✅</div>
          <p className="font-medium">All settled up!</p>
          <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>No outstanding debts in this group</p>
        </div>
      )}

      {data && !allSettled && (
        <div className="flex flex-col gap-5">

          {/* YOU section */}
          <div>
            <p className="tg-label mb-2">You</p>
            <div className="tg-section">
              {/* Nothing owed either way */}
              {settleGroups.length === 0 && (
                <div className="tg-list-item" style={{ borderBottom: 'none' }}>
                  <p className="text-sm font-medium mb-1">
                    {currentMember.first_name}{currentMember.last_name ? ` ${currentMember.last_name}` : ''}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>All settled up ✓</p>
                </div>
              )}

              {/* Debts involving you, one row per person */}
              {settleGroups.map((g, idx) => {
                const isLast = idx === settleGroups.length - 1
                const owe = 'var(--tg-theme-destructive-text-color, #ff3b30)'
                const get = 'var(--tg-theme-button-color)'
                const hint = 'var(--tg-theme-hint-color)'
                const lines = g.entries.map(e => ({ currency: e.currency, net: e.direction === 'pay' ? -e.owed : e.owed }))
                // SGD total of everything with this person (signed: negative = you owe), only when every
                // currency has a rate, never a partial total
                const sum = directRates || g.entries.every(e => e.currency === CONVERT_TO)
                  ? sumConverted(lines, directRates, CONVERT_TO) : null
                const total = sum && sum.usedAny && sum.missing.length === 0 ? sum.total : null
                const mixed = g.entries.some(e => e.direction === 'pay') && g.entries.some(e => e.direction === 'receive')
                const only = g.entries.length === 1 ? g.entries[0]! : null

                // Headline: "Jac owes you ≈ SGD 52.09" / "You owe Jac SGD 12.00"
                let headline: string
                let color = get
                if (total !== null) {
                  const approx = g.entries.some(e => e.currency !== CONVERT_TO) ? '≈ ' : ''
                  const amount = `${approx}${CONVERT_TO} ${Math.abs(total).toFixed(2)}`
                  if (Math.abs(total) < 0.005) { headline = `${g.personName}: evens out`; color = hint }
                  else if (total < 0) { headline = `You owe ${g.personName} ${amount}${mixed ? ' net' : ''}`; color = owe }
                  else { headline = `${g.personName} owes you ${amount}${mixed ? ' net' : ''}` }
                } else if (only) {
                  headline = only.direction === 'pay'
                    ? `You owe ${g.personName} ${only.currency} ${only.owed.toFixed(2)}`
                    : `${g.personName} owes you ${only.currency} ${only.owed.toFixed(2)}`
                  color = only.direction === 'pay' ? owe : get
                } else {
                  headline = g.personName
                  color = 'var(--tg-theme-text-color)'
                }
                // The original amounts, unless the headline already is the exact amount
                const showLines = !!sum && (g.entries.length > 1 || (total !== null && only!.currency !== CONVERT_TO))
                  || (!sum && g.entries.length > 1)
                return (
                  <div key={g.personId} className="tg-list-item flex items-center justify-between gap-3"
                    style={{ borderBottom: isLast ? 'none' : undefined }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color }}>{headline}</p>
                      {showLines && g.entries.map(e => (
                        <p key={e.key} className="text-xs mt-0.5" style={{ color: e.direction === 'pay' ? owe : get, paddingLeft: 12 }}>
                          {e.direction === 'pay' ? 'you owe' : 'owes you'} {e.currency} {e.owed.toFixed(2)}
                        </p>
                      ))}
                    </div>
                    <button
                      onClick={() => setSettleTarget(g)}
                      className="py-1.5 px-3 rounded-xl text-xs font-medium flex-shrink-0"
                      style={{ background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)', border: 'none', cursor: 'pointer' }}
                    >
                      Settle
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* OTHERS section — collapsible rows */}
          {otherMemberIds.length > 0 && (
            <div>
              <p className="tg-label mb-2">Others</p>
              <div className="tg-section">
                {otherMemberIds.map((memberId, idx) => {
                  const name = memberName(memberId)
                  const lines = memberCurrencyLines(memberId)
                  const memberCombined = combined(lines)
                  const debts = memberDebts(memberId)
                  const expanded = expandedMembers.has(memberId)
                  const isLast = idx === otherMemberIds.length - 1
                  const hasDetails = lines.length > 0 || debts.length > 0

                  return (
                    <div key={memberId} style={{ borderBottom: isLast ? 'none' : '0.5px solid rgba(0,0,0,0.08)' }}>
                      {/* Collapsible header row */}
                      <button
                        onClick={() => hasDetails && toggleMember(memberId)}
                        className="w-full flex items-center justify-between gap-3"
                        style={{
                          padding: '12px 16px',
                          background: 'none',
                          border: 'none',
                          cursor: hasDetails ? 'pointer' : 'default',
                          textAlign: 'left',
                        }}
                      >
                        <span className="text-sm font-medium">{name}</span>
                        <span className="flex items-center gap-2">
                          <span className="flex flex-col items-end gap-0.5">
                            {lines.length === 0 ? (
                              <span className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>Settled</span>
                            ) : memberCombined ? (
                              <span className="text-xs font-bold" style={{
                                color: memberCombined.even
                                  ? 'var(--tg-theme-hint-color)'
                                  : memberCombined.total > 0 ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-destructive-text-color, #ff3b30)',
                              }}>
                                {memberCombined.even
                                  ? `evens out ${CONVERT_TO} 0.00`
                                  : `${memberCombined.total > 0 ? 'gets back' : 'owes'} ${memberCombined.approx ? '≈ ' : ''}${CONVERT_TO} ${Math.abs(memberCombined.total).toFixed(2)}`}
                              </span>
                            ) : lines.map(({ currency, net }) => (
                              <span key={currency} className="text-xs font-bold" style={{
                                color: net > 0 ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-destructive-text-color, #ff3b30)',
                              }}>
                                {net > 0 ? 'gets back' : 'owes'} {currency} {Math.abs(net).toFixed(2)}
                              </span>
                            ))}
                          </span>
                          {hasDetails && (
                            <span style={{ color: 'var(--tg-theme-hint-color)', fontSize: '12px' }}>
                              {expanded ? '▲' : '▼'}
                            </span>
                          )}
                        </span>
                      </button>

                      {/* Expanded debt details */}
                      {expanded && (
                        <div style={{ padding: '0 16px 12px', borderTop: '0.5px solid rgba(0,0,0,0.06)' }}>
                          {debts.map((d, di) => {
                            const theyOwe = d.from_member_id === memberId
                            const other = theyOwe ? d.to_name : d.from_name
                            const approx = approxStr(d.amount, d.currency)
                            return (
                              <p key={di} className="text-xs py-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
                                {theyOwe ? `${name} owes ${other}` : `${other} owes ${name}`}
                                {' '}
                                <span className="font-semibold" style={{ color: 'var(--tg-theme-text-color)' }}>
                                  {approx ?? `${d.currency} ${d.amount.toFixed(2)}`}
                                </span>
                                {approx && (
                                  <span style={{ color: 'var(--tg-theme-hint-color)', fontWeight: 400 }}> ({d.currency} {d.amount.toFixed(2)})</span>
                                )}
                              </p>
                            )
                          })}
                          {debts.length === 0 && (
                            <p className="text-xs py-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
                              No debts with others
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {settleTarget && (
        <SettleSheet
          group={settleTarget}
          rates={directRates}
          onClose={() => setSettleTarget(null)}
          onConfirm={handleRecord}
        />
      )}
    </div>
  )
}
