'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppContext } from '@/components/AppProvider'
import type { Expense, Settlement } from '@/types'

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

type CurrencyBalance = { amount: number; currency: string }

const AVATAR_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#DDA0DD',
  '#F39C12', '#1ABC9C', '#9B59B6', '#E67E22', '#2ECC71',
]

function MemberAvatar({ member, size = 36 }: { member: { id: number; first_name: string; photo_url?: string | null }; size?: number }) {
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

function MembersSheet({ onClose }: { onClose: () => void }) {
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

export function ExpensesPage() {
  const router = useRouter()
  const { chatId, group, currentMember, apiHeaders } = useAppContext()

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [myBalances, setMyBalances] = useState<CurrencyBalance[] | null>(null)
  const [showMembers, setShowMembers] = useState(false)

  const fetchExpenses = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/groups/${chatId}/expenses?page=${p}`, { headers: apiHeaders })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setExpenses(data.items)
      setTotal(data.total)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [chatId, apiHeaders])

  const fetchBalance = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${chatId}/balances`, { headers: apiHeaders })
      if (!res.ok) return
      const data = await res.json()
      const byCurrency = data.balances_by_currency as Record<string, Array<{ member_id: number; net_amount: number }>>
      const lines = Object.entries(byCurrency).flatMap(([cur, bals]) => {
        const mine = bals.find(b => b.member_id === currentMember.id)
        return mine && Math.abs(mine.net_amount) > 0.005 ? [{ amount: mine.net_amount, currency: cur }] : []
      })
      setMyBalances(lines)
    } catch { /* ignore */ }
  }, [chatId, apiHeaders, currentMember.id])

  const fetchSettlements = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${chatId}/settlements`, { headers: apiHeaders })
      if (!res.ok) return
      setSettlements(await res.json())
    } catch { /* ignore */ }
  }, [chatId, apiHeaders])

  useEffect(() => { fetchExpenses(page) }, [fetchExpenses, page])
  useEffect(() => { fetchBalance() }, [fetchBalance])
  useEffect(() => { fetchSettlements() }, [fetchSettlements])

  const handleDelete = (id: number) => {
    const tg = window.Telegram?.WebApp
    const doDelete = async () => {
      setDeletingId(id)
      try {
        await fetch(`/api/groups/${chatId}/expenses/${id}`, { method: 'DELETE', headers: apiHeaders })
        fetchExpenses(page)
        fetchBalance()
      } catch (e) {
        alert(String(e))
      } finally {
        setDeletingId(null)
      }
    }

    if (tg) {
      tg.showConfirm('Delete this expense?', confirmed => { if (confirmed) doDelete() })
    } else if (confirm('Delete this expense?')) {
      doDelete()
    }
  }

  const navigate = (path: string) => router.push(`${path}?chatId=${chatId}`)

  const pageSize = 30
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const balanceText = myBalances === null ? null
    : myBalances.length === 0 ? 'All settled up ✓'
    : (() => {
        const owed = myBalances.filter(b => b.amount > 0)
        const owe = myBalances.filter(b => b.amount < 0)
        if (owe.length === 0)
          return 'You are owed ' + owed.map(b => `${b.currency} ${b.amount.toFixed(2)}`).join(' + ')
        if (owed.length === 0)
          return 'You owe ' + owe.map(b => `${b.currency} ${Math.abs(b.amount).toFixed(2)}`).join(' + ')
        return [
          ...owed.map(b => `You are owed ${b.currency} ${b.amount.toFixed(2)}`),
          ...owe.map(b => `You owe ${b.currency} ${Math.abs(b.amount).toFixed(2)}`),
        ].join(', ')
      })()

  const balanceColor = !myBalances || myBalances.length === 0
    ? 'var(--tg-theme-hint-color)'
    : myBalances.every(b => b.amount > 0)
      ? 'var(--tg-theme-button-color)'
      : myBalances.every(b => b.amount < 0)
        ? 'var(--tg-theme-destructive-text-color, #ff3b30)'
        : 'var(--tg-theme-hint-color)'

  return (
    <>
    {/* Sticky header: title, balance, action buttons */}
    <div
      className="sticky top-0 z-10 px-4 pt-4 pb-3"
      style={{ background: 'var(--tg-theme-bg-color)' }}
    >
      {/* Top row: title + balance + members icon */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0 pr-3">
          <h1 className="font-bold text-lg leading-tight">{group.title}</h1>
          {balanceText && (
            <p className="text-xs mt-0.5 font-medium" style={{ color: balanceColor }}>
              {balanceText}
            </p>
          )}
        </div>
        <button
          onClick={() => setShowMembers(true)}
          className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-full"
          style={{
            background: 'var(--tg-theme-secondary-bg-color)',
            border: 'none',
            cursor: 'pointer',
            fontSize: '18px',
          }}
          aria-label="Group members"
        >
          👥
        </button>
      </div>

      {/* Action buttons row */}
      <div className="flex gap-2">
        <button
          onClick={() => navigate('/balances')}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium"
          style={{
            background: 'var(--tg-theme-section-bg-color)',
            border: '1px solid rgba(0,0,0,0.12)',
            cursor: 'pointer',
            color: 'var(--tg-theme-text-color)',
          }}
        >
          ⚖️ Balances
        </button>
        <button
          onClick={() => navigate('/add')}
          className="flex-1 tg-btn py-2.5 rounded-xl text-sm font-medium"
          style={{ width: 'auto' }}
        >
          + Add
        </button>
      </div>
    </div>

    {/* Scrollable list area */}
    <div className="px-4 pb-8">
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

      {!loading && !error && expenses.length === 0 && settlements.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="text-5xl">🧾</div>
          <p className="font-medium">No expenses yet</p>
          <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
            Tap + Add to record your first expense
          </p>
        </div>
      )}

      {/* Merged expense + settlement list, sorted by date desc */}
      <div className="flex flex-col gap-2">
        {[
          ...expenses.map(e => ({ kind: 'expense' as const, date: new Date(e.date).getTime(), data: e })),
          ...settlements.map(s => ({ kind: 'settlement' as const, date: new Date(s.created_at).getTime(), data: s })),
        ]
          .sort((a, b) => b.date - a.date)
          .map(item => {
            if (item.kind === 'settlement') {
              const s = item.data
              return (
                <div key={`s-${s.id}`} className="tg-section" style={{ borderRadius: '12px' }}>
                  <div className="flex items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {s.from_name} paid {s.to_name}{' '}
                        <span className="font-bold">{s.currency} {Number(s.amount).toFixed(2)}</span>
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
                        Settlement · {formatDate(s.created_at)}
                      </p>
                    </div>
                    <span className="text-base flex-shrink-0">✅</span>
                  </div>
                </div>
              )
            }

            const exp = item.data
            const myAmt = exp.my_split_amount != null ? Number(exp.my_split_amount) : null
            const isPayer = exp.paid_by_member_id === currentMember.id
            const total = Number(exp.total_amount)
            let myVerbLabel: string | null = null
            let myAmtDisplay: string | null = null
            let myLabelColor = 'var(--tg-theme-hint-color)'
            if (myAmt !== null) {
              if (isPayer && total - myAmt > 0.005) {
                myVerbLabel = 'You lent'
                myAmtDisplay = `${exp.currency} ${(total - myAmt).toFixed(2)}`
                myLabelColor = 'var(--tg-theme-button-color)'
              } else if (!isPayer && myAmt > 0.005) {
                myVerbLabel = 'You borrowed'
                myAmtDisplay = `${exp.currency} ${myAmt.toFixed(2)}`
                myLabelColor = 'var(--tg-theme-destructive-text-color, #ff3b30)'
              }
            }
            return (
              <div key={`e-${exp.id}`} className="tg-section" style={{ borderRadius: '12px' }}>
                <div className="flex items-start gap-3 p-3">
                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-base truncate">{exp.description}</p>
                    {exp.category && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
                        {exp.category}
                      </p>
                    )}
                    <p className="text-xs mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
                      {exp.paid_by_name ?? '?'} paid {exp.currency} {total.toFixed(2)} · {formatDate(exp.date)}
                    </p>
                  </div>

                  {/* Right: personal amount + actions */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {myVerbLabel ? (
                      <div className="flex flex-col items-end gap-0.5">
                        <p className="text-xs" style={{ color: myLabelColor }}>{myVerbLabel}</p>
                        <p className="font-bold text-base" style={{ color: myLabelColor }}>{myAmtDisplay}</p>
                      </div>
                    ) : (
                      <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>Not involved</p>
                    )}
                    <div className="flex gap-1">
                      <button
                        onClick={() => navigate(`/edit/${exp.id}`)}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{
                          background: 'var(--tg-theme-secondary-bg-color)',
                          color: 'var(--tg-theme-link-color)',
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(exp.id)}
                        disabled={deletingId === exp.id}
                        className="text-xs px-2 py-1 rounded-lg"
                        style={{
                          background: 'var(--tg-theme-secondary-bg-color)',
                          color: 'var(--tg-theme-destructive-text-color, #ff3b30)',
                          opacity: deletingId === exp.id ? 0.5 : 1,
                        }}
                      >
                        {deletingId === exp.id ? '…' : 'Del'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center items-center gap-6 mt-4 py-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            className="text-2xl disabled:opacity-30"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ‹
          </button>
          <span className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            className="text-2xl disabled:opacity-30"
            style={{ background: 'none', border: 'none', cursor: 'pointer' }}
          >
            ›
          </button>
        </div>
      )}
    </div>

    {showMembers && <MembersSheet onClose={() => setShowMembers(false)} />}
    </>
  )
}
