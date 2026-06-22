'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppContext } from '@/components/AppProvider'
import { useShowSkeleton } from '@/lib/use-show-skeleton'
import type { SimplifiedDebt } from '@/types'
import type { NamedBalance } from '@/lib/balances'

interface BalancesData {
  balances: NamedBalance[]
  balances_by_currency: Record<string, NamedBalance[]>
  simplified_debts: SimplifiedDebt[]
}

interface SettleModalProps {
  debt: SimplifiedDebt
  label: string
  onClose: () => void
  onConfirm: (amount: number) => Promise<void>
}

function SettleModal({ debt, label, onClose, onConfirm }: SettleModalProps) {
  const [amount, setAmount] = useState(debt.amount.toFixed(2))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return }
    if (amt > debt.amount + 0.005) { setError(`Amount cannot exceed the debt (${debt.currency} ${debt.amount.toFixed(2)})`); return }
    setSubmitting(true)
    try { await onConfirm(amt) }
    catch (err) { setError(String(err)) }
    finally { setSubmitting(false) }
  }

  return (
    <div
      className="fixed inset-0 flex items-end justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full rounded-t-2xl p-5 flex flex-col gap-4"
        style={{ background: 'var(--tg-theme-bg-color)', maxHeight: '70dvh' }}>
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold">Record Payment</h2>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: 'var(--tg-theme-hint-color)' }}>
            ×
          </button>
        </div>
        <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>{label}</p>
        {error && <p className="text-sm" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>{error}</p>}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <p className="tg-label">Amount ({debt.currency})</p>
            <div className="tg-section">
              <input className="tg-input text-lg font-semibold" type="number" inputMode="decimal"
                step="0.01" min="0.01" max={debt.amount} value={amount} onChange={e => setAmount(e.target.value)} autoFocus />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="flex-1 py-3 rounded-xl text-sm font-medium"
              style={{ background: 'var(--tg-theme-secondary-bg-color)', border: 'none', cursor: 'pointer', color: 'var(--tg-theme-text-color)' }}>
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="flex-1 tg-btn" style={{ opacity: submitting ? 0.7 : 1 }}>
              {submitting ? 'Recording…' : 'Record Payment'}
            </button>
          </div>
        </form>
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

export function BalancesPage() {
  const router = useRouter()
  const { chatId, currentMember, apiHeaders } = useAppContext()
  const [data, setData] = useState<BalancesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const showSkeleton = useShowSkeleton(loading)
  const [settleDebt, setSettleDebt] = useState<{ debt: SimplifiedDebt; label: string } | null>(null)
  const [expandedMembers, setExpandedMembers] = useState<Set<number>>(new Set())

  const [notifying, setNotifying] = useState(false)
  const [notifyError, setNotifyError] = useState<string | null>(null)
  const [notifySent, setNotifySent] = useState(false)

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

  const loadBalances = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/groups/${chatId}/balances`, { headers: apiHeaders })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setData(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [chatId, apiHeaders])

  useEffect(() => { loadBalances() }, [loadBalances])

  const handleSettle = async (debt: SimplifiedDebt, amount: number) => {
    const res = await fetch(`/api/groups/${chatId}/settlements`, {
      method: 'POST',
      headers: apiHeaders,
      body: JSON.stringify({ from_member_id: debt.from_member_id, to_member_id: debt.to_member_id, amount, currency: debt.currency }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(d.error ?? `HTTP ${res.status}`)
    }
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')
    setSettleDebt(null)
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

  // My net per currency from balances_by_currency
  const myCurrencyLines: { currency: string; net: number }[] = data
    ? Object.entries(data.balances_by_currency).flatMap(([cur, bals]) => {
        const mine = bals.find(b => b.member_id === currentMember.id)
        return mine && Math.abs(mine.net_amount) > 0.005
          ? [{ currency: cur, net: mine.net_amount }]
          : []
      })
    : []

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

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-8 page-enter">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/?chatId=${chatId}`)}
            className="text-sm font-medium"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg-theme-link-color)' }}
          >
            ← Back
          </button>
          <h1 className="font-bold text-lg">Balances</h1>
        </div>
        {data && !allSettled && (
          <button
            onClick={handleNotify}
            disabled={notifying}
            className="text-sm font-medium px-3 py-1.5 rounded-xl flex-shrink-0"
            style={{
              background: notifySent ? 'rgba(52,199,89,0.15)' : 'var(--tg-theme-secondary-bg-color)',
              border: 'none',
              cursor: notifying ? 'default' : 'pointer',
              color: notifySent ? '#34c759' : 'var(--tg-theme-text-color)',
              opacity: notifying ? 0.6 : 1,
            }}
          >
            {notifying ? 'Sending…' : notifySent ? 'Sent ✓' : 'Notify Group'}
          </button>
        )}
      </div>
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
              {/* Your net per currency */}
              <div className="tg-list-item" style={{ borderBottom: myDebts.length > 0 ? undefined : 'none' }}>
                <p className="text-sm font-medium mb-1">
                  {currentMember.first_name}{currentMember.last_name ? ` ${currentMember.last_name}` : ''}
                </p>
                {myCurrencyLines.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>All settled up ✓</p>
                ) : (
                  myCurrencyLines.map(({ currency, net }) => (
                    <p key={currency} className="text-xs font-medium" style={{
                      color: net > 0 ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-destructive-text-color, #ff3b30)',
                    }}>
                      {net > 0
                        ? `You get back ${currency} ${net.toFixed(2)}`
                        : `You owe ${currency} ${Math.abs(net).toFixed(2)}`}
                    </p>
                  ))
                )}
              </div>

              {/* Debts involving you */}
              {myDebts.map((debt, idx) => {
                const iOwe = debt.from_member_id === currentMember.id
                const other = iOwe ? debt.to_name : debt.from_name
                const label = iOwe ? `You owe ${other}` : `${other} owes you`
                const settleLabel = iOwe ? `You pay ${other}` : `${other} pays you`
                const isLast = idx === myDebts.length - 1
                return (
                  <div key={idx} className="tg-list-item flex items-center justify-between gap-3"
                    style={{ borderBottom: isLast ? 'none' : undefined }}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>{label}</p>
                      <p className="text-sm font-bold" style={{
                        color: iOwe
                          ? 'var(--tg-theme-destructive-text-color, #ff3b30)'
                          : 'var(--tg-theme-button-color)',
                      }}>
                        {debt.currency} {debt.amount.toFixed(2)}
                      </p>
                    </div>
                    <button
                      onClick={() => setSettleDebt({ debt, label: settleLabel })}
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
                            return (
                              <p key={di} className="text-xs py-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
                                {theyOwe ? `${name} owes ${other}` : `${other} owes ${name}`}
                                {' '}
                                <span className="font-semibold" style={{ color: 'var(--tg-theme-text-color)' }}>
                                  {d.currency} {d.amount.toFixed(2)}
                                </span>
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

      {settleDebt && (
        <SettleModal
          debt={settleDebt.debt}
          label={settleDebt.label}
          onClose={() => setSettleDebt(null)}
          onConfirm={amount => handleSettle(settleDebt.debt, amount)}
        />
      )}
    </div>
  )
}
