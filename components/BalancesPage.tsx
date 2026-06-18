'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAppContext } from '@/components/AppProvider'
import type { Balance, SimplifiedDebt } from '@/types'

interface BalancesData {
  currency: string
  balances: Balance[]
  simplified_debts: SimplifiedDebt[]
}

interface SettleModalProps {
  debt: SimplifiedDebt
  onClose: () => void
  onConfirm: (amount: number) => Promise<void>
}

function SettleModal({ debt, onClose, onConfirm }: SettleModalProps) {
  const [amount, setAmount] = useState(debt.amount.toFixed(2))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setError('Enter a valid amount'); return }
    setSubmitting(true)
    try {
      await onConfirm(amt)
    } catch (err) {
      setError(String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-end justify-center z-50 pb-safe"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full rounded-t-2xl p-5 flex flex-col gap-4"
        style={{
          background: 'var(--tg-theme-bg-color)',
          maxHeight: '70vh',
        }}
      >
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold">Record Payment</h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '24px', color: 'var(--tg-theme-hint-color)' }}
          >
            ×
          </button>
        </div>

        <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
          <strong style={{ color: 'var(--tg-theme-text-color)' }}>{debt.from_name}</strong>
          {' pays '}
          <strong style={{ color: 'var(--tg-theme-text-color)' }}>{debt.to_name}</strong>
        </p>

        {error && (
          <p className="text-sm" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>{error}</p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <p className="tg-label">Amount ({debt.currency})</p>
            <div className="tg-section">
              <input
                className="tg-input text-lg font-semibold"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-xl text-sm font-medium"
              style={{ background: 'var(--tg-theme-secondary-bg-color)', border: 'none', cursor: 'pointer', color: 'var(--tg-theme-text-color)' }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 tg-btn"
              style={{ opacity: submitting ? 0.7 : 1 }}
            >
              {submitting ? 'Recording…' : 'Record Payment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export function BalancesPage() {
  const { chatId, group, apiHeaders } = useAppContext()
  const [data, setData] = useState<BalancesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [settleDebt, setSettleDebt] = useState<SimplifiedDebt | null>(null)

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
      body: JSON.stringify({
        from_member_id: debt.from_member_id,
        to_member_id: debt.to_member_id,
        amount,
      }),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(d.error ?? `HTTP ${res.status}`)
    }
    window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')
    setSettleDebt(null)
    loadBalances()
  }

  const allSettled = data && data.simplified_debts.length === 0 && data.balances.every(b => Math.abs(b.net_amount) < 0.01)

  return (
    <div className="p-4">
      <div className="mb-4">
        <h1 className="font-bold text-lg leading-tight">{group.title}</h1>
        <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>Balances · {group.currency}</p>
      </div>

      {loading && (
        <div className="flex justify-center py-12">
          <p style={{ color: 'var(--tg-theme-hint-color)' }}>Loading…</p>
        </div>
      )}

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
          {/* Net Balances */}
          {data.balances.length > 0 && (
            <div>
              <p className="tg-label mb-2">Net Balances</p>
              <div className="tg-section">
                {data.balances.map((b, idx) => {
                  const isPos = b.net_amount > 0.005
                  const isNeg = b.net_amount < -0.005
                  const isLast = idx === data.balances.length - 1
                  return (
                    <div
                      key={b.member_id}
                      className="tg-list-item flex justify-between items-center"
                      style={{ borderBottom: isLast ? 'none' : undefined }}
                    >
                      <span className="text-sm font-medium">{b.member_name}</span>
                      <span
                        className="text-sm font-bold"
                        style={{
                          color: isPos
                            ? '#34c759'
                            : isNeg
                            ? 'var(--tg-theme-destructive-text-color, #ff3b30)'
                            : 'var(--tg-theme-hint-color)',
                        }}
                      >
                        {isPos ? '+' : ''}{b.net_amount.toFixed(2)} {group.currency}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Simplified debts */}
          {data.simplified_debts.length > 0 && (
            <div>
              <p className="tg-label mb-2">Who Pays Whom</p>
              <div className="flex flex-col gap-2">
                {data.simplified_debts.map((debt, idx) => (
                  <div key={idx} className="tg-section p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <p className="text-sm">
                          <span className="font-semibold">{debt.from_name}</span>
                          <span style={{ color: 'var(--tg-theme-hint-color)' }}> owes </span>
                          <span className="font-semibold">{debt.to_name}</span>
                        </p>
                        <p className="text-base font-bold mt-0.5" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
                          {debt.currency} {debt.amount.toFixed(2)}
                        </p>
                      </div>
                      <button
                        onClick={() => setSettleDebt(debt)}
                        className="py-2 px-3 rounded-xl text-sm font-medium"
                        style={{
                          background: 'var(--tg-theme-button-color)',
                          color: 'var(--tg-theme-button-text-color)',
                          border: 'none',
                          cursor: 'pointer',
                          flexShrink: 0,
                        }}
                      >
                        Settle
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {settleDebt && (
        <SettleModal
          debt={settleDebt}
          onClose={() => setSettleDebt(null)}
          onConfirm={amount => handleSettle(settleDebt, amount)}
        />
      )}
    </div>
  )
}
