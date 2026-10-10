'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppContext } from '@/components/AppProvider'
import { useShowSkeleton } from '@/lib/use-show-skeleton'
import type { ActivityEvent, Expense, ExpenseSplit, Member, Settlement } from '@/types'
import { ExpenseActivity } from '@/components/ExpenseActivity'
import { useGroupData } from '@/components/GroupData'

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatDateHeader(dateStr: string) {
  const d = new Date(dateStr)
  return {
    date: d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }),
    day: d.toLocaleDateString('en-US', { weekday: 'long' }),
  }
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
}

type DetailState =
  | { kind: 'expense'; item: Expense; splits: ExpenseSplit[] | null; receiptUrl?: string | null; activity?: ActivityEvent[] } // receiptUrl: undefined = still loading
  | { kind: 'settlement'; item: Settlement }

function PencilIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
      <path d="M10 11v6M14 11v6"/>
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
    </svg>
  )
}

function DetailPanel({
  detail,
  members,
  onClose,
  onEdit,
  onDeleteExpense,
  onDeleteSettlement,
  onUpdateSettlement,
  currentMemberId,
}: {
  detail: DetailState
  members: Member[]
  onClose: () => void
  onEdit: (id: number) => void
  onDeleteExpense: (id: number) => void
  onDeleteSettlement: (id: number) => void
  onUpdateSettlement: (id: number, data: { from_member_id: number; to_member_id: number; amount: number; currency: string }) => Promise<void>
  currentMemberId: number
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editFrom, setEditFrom] = useState(0)
  const [editTo, setEditTo] = useState(0)
  const [editAmount, setEditAmount] = useState('')
  const [editCurrency, setEditCurrency] = useState('')
  const [editError, setEditError] = useState<string | null>(null)
  const [editSaving, setEditSaving] = useState(false)
  const [receiptOpen, setReceiptOpen] = useState(false)
  const [receiptBroken, setReceiptBroken] = useState(false)

  const memberName = (m: Member) => `${m.first_name}${m.last_name ? ` ${m.last_name}` : ''}`

  const startEditing = () => {
    if (detail.kind !== 'settlement') return
    setEditFrom(detail.item.from_member_id)
    setEditTo(detail.item.to_member_id)
    setEditAmount(Number(detail.item.amount).toFixed(2))
    setEditCurrency(detail.item.currency)
    setEditError(null)
    setIsEditing(true)
  }

  const handleSave = async () => {
    if (detail.kind !== 'settlement') return
    const amt = parseFloat(editAmount)
    if (isNaN(amt) || amt <= 0) { setEditError('Enter a valid amount'); return }
    if (editFrom === editTo) { setEditError('From and To must be different people'); return }
    if (!editCurrency.trim()) { setEditError('Enter a currency code'); return }
    setEditSaving(true)
    setEditError(null)
    try {
      await onUpdateSettlement(detail.item.id, {
        from_member_id: editFrom,
        to_member_id: editTo,
        amount: amt,
        currency: editCurrency.trim().toUpperCase(),
      })
      setIsEditing(false)
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')
    } catch (err) {
      setEditError(String(err))
    } finally {
      setEditSaving(false)
    }
  }

  return (
    <div
      className="fixed inset-0 flex items-end justify-center z-50"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        className="w-full rounded-t-2xl flex flex-col overflow-hidden"
        style={{ background: 'var(--tg-theme-bg-color)', maxHeight: '85dvh' }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderBottom: '0.5px solid rgba(0,0,0,0.08)' }}
        >
          {isEditing ? (
            <>
              <button
                onClick={() => setIsEditing(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg-theme-link-color)', fontSize: '15px', fontWeight: 500, padding: '4px 0' }}
              >
                Cancel
              </button>
              <span style={{ fontSize: '17px', fontWeight: 600 }}>Edit Settlement</span>
              <button
                onClick={handleSave}
                disabled={editSaving}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg-theme-link-color)', fontSize: '15px', fontWeight: 600, padding: '4px 0', opacity: editSaving ? 0.5 : 1 }}
              >
                {editSaving ? 'Saving…' : 'Save'}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={onClose}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg-theme-link-color)', fontSize: '15px', fontWeight: 500, padding: '4px 0' }}
              >
                ← Back
              </button>
              <span style={{ fontSize: '17px', fontWeight: 600 }}>
                {detail.kind === 'expense' ? 'Expense' : 'Settlement'}
              </span>
              <div className="flex items-center gap-2">
                {detail.kind === 'expense' ? (
                  <button
                    onClick={() => onEdit(detail.item.id)}
                    className="flex items-center justify-center w-8 h-8 rounded-full"
                    style={{ background: 'rgba(36,129,204,0.12)', border: 'none', cursor: 'pointer', color: '#2481cc' }}
                    aria-label="Edit"
                  >
                    <PencilIcon />
                  </button>
                ) : (
                  <button
                    onClick={startEditing}
                    className="flex items-center justify-center w-8 h-8 rounded-full"
                    style={{ background: 'rgba(36,129,204,0.12)', border: 'none', cursor: 'pointer', color: '#2481cc' }}
                    aria-label="Edit"
                  >
                    <PencilIcon />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (detail.kind === 'expense') onDeleteExpense(detail.item.id)
                    else onDeleteSettlement(detail.item.id)
                  }}
                  className="flex items-center justify-center w-8 h-8 rounded-full"
                  style={{ background: 'rgba(255,59,48,0.1)', border: 'none', cursor: 'pointer', color: '#ff3b30' }}
                  aria-label="Delete"
                >
                  <TrashIcon />
                </button>
              </div>
            </>
          )}
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5">
          {detail.kind === 'expense' ? (
            <>
              <div className="text-center mb-6">
                {detail.item.category && (
                  <div style={{ fontSize: '44px', marginBottom: '10px' }}>{detail.item.category}</div>
                )}
                <p style={{ fontSize: '20px', fontWeight: 700, marginBottom: '6px' }}>{detail.item.description}</p>
                <p style={{ fontSize: '30px', fontWeight: 300, color: 'var(--tg-theme-button-color)', marginBottom: '5px' }}>
                  {detail.item.currency} {Number(detail.item.total_amount).toFixed(2)}
                </p>
                <p style={{ fontSize: '13px', color: 'var(--tg-theme-hint-color)' }}>
                  {detail.item.paid_by_name} paid · {formatDate(detail.item.date)}
                </p>
              </div>

              {detail.item.has_receipt && (
                <div className="mb-5">
                  <p className="tg-label mb-2">Receipt</p>
                  {detail.receiptUrl === undefined ? (
                    <div style={{ height: 120, borderRadius: 12, background: 'rgba(0,0,0,0.07)' }} />
                  ) : detail.receiptUrl === null || receiptBroken ? (
                    <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
                      Receipt unavailable. Close and reopen this expense to retry.
                    </p>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setReceiptOpen(true)}
                      aria-label="View receipt"
                      style={{ display: 'block', width: '100%', padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={detail.receiptUrl}
                        alt="Receipt"
                        onError={() => setReceiptBroken(true)}
                        style={{ width: '100%', maxHeight: 180, objectFit: 'cover', objectPosition: 'top', borderRadius: 12 }}
                      />
                    </button>
                  )}
                  {detail.receiptUrl && !receiptBroken && (
                    <p className="text-xs mt-1.5 px-1" style={{ color: 'var(--tg-theme-hint-color)' }}>Tap to enlarge</p>
                  )}
                </div>
              )}

              <p className="tg-label mb-2">Split</p>
              <div className="tg-section">
                {detail.splits === null ? (
                  members.map((m, i) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between"
                      style={{ padding: '11px 16px', borderBottom: i === members.length - 1 ? 'none' : '0.5px solid rgba(0,0,0,0.08)' }}
                    >
                      <div style={{ height: 12, width: '35%', borderRadius: 6, background: 'rgba(0,0,0,0.07)' }} />
                      <div style={{ height: 12, width: '22%', borderRadius: 6, background: 'rgba(0,0,0,0.07)' }} />
                    </div>
                  ))
                ) : detail.splits.map((split, i) => {
                  const isMe = split.member_id === currentMemberId
                  const isPayer = split.member_id === detail.item.paid_by_member_id
                  const isLast = i === detail.splits!.length - 1
                  return (
                    <div
                      key={split.id ?? i}
                      className="flex items-center justify-between"
                      style={{
                        padding: '11px 16px',
                        borderBottom: isLast ? 'none' : '0.5px solid rgba(0,0,0,0.08)',
                        background: isMe ? 'rgba(36,129,204,0.04)' : undefined,
                      }}
                    >
                      <p className="text-sm" style={{ fontWeight: isMe ? 600 : 400 }}>
                        {isMe ? 'You' : split.member_name}
                        {isPayer && (
                          <span style={{ fontSize: '11px', color: 'var(--tg-theme-hint-color)', marginLeft: '6px' }}>paid</span>
                        )}
                      </p>
                      <p className="text-sm font-semibold" style={{
                        color: isPayer ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-text-color)',
                      }}>
                        {detail.item.currency} {Number(split.amount).toFixed(2)}
                      </p>
                    </div>
                  )
                })}
              </div>

              {detail.activity && <ExpenseActivity events={detail.activity} />}
            </>
          ) : isEditing ? (
            /* Settlement edit form */
            <div className="flex flex-col gap-4">
              {editError && (
                <p className="text-sm" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>{editError}</p>
              )}
              <div>
                <p className="tg-label mb-2">From (who paid)</p>
                <div className="tg-section">
                  <select
                    className="tg-input"
                    value={editFrom}
                    onChange={e => setEditFrom(Number(e.target.value))}
                  >
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{memberName(m)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <p className="tg-label mb-2">To (who received)</p>
                <div className="tg-section">
                  <select
                    className="tg-input"
                    value={editTo}
                    onChange={e => setEditTo(Number(e.target.value))}
                  >
                    {members.map(m => (
                      <option key={m.id} value={m.id}>{memberName(m)}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <p className="tg-label mb-2">Amount ({editCurrency || '—'})</p>
                <div className="tg-section">
                  <input
                    className="tg-input text-lg font-semibold"
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0.01"
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div>
                <p className="tg-label mb-2">Currency</p>
                <div className="tg-section">
                  <input
                    className="tg-input"
                    type="text"
                    maxLength={3}
                    value={editCurrency}
                    onChange={e => setEditCurrency(e.target.value.toUpperCase())}
                    placeholder="e.g. SGD"
                  />
                </div>
              </div>
            </div>
          ) : (
            /* Settlement view */
            <div className="text-center py-6">
              <div style={{ fontSize: '44px', marginBottom: '12px' }}>💸</div>
              <p style={{ fontSize: '20px', fontWeight: 700, marginBottom: '6px' }}>
                {detail.item.from_name} paid {detail.item.to_name}
              </p>
              <p style={{ fontSize: '30px', fontWeight: 300, color: '#34c759', marginBottom: '5px' }}>
                {detail.item.currency} {Number(detail.item.amount).toFixed(2)}
              </p>
              <p style={{ fontSize: '13px', color: 'var(--tg-theme-hint-color)' }}>
                Settlement · {formatDate(detail.item.created_at)}
              </p>
            </div>
          )}
        </div>
      </div>

      {receiptOpen && detail.kind === 'expense' && detail.receiptUrl && (
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.92)', zIndex: 60 }}
          onClick={() => setReceiptOpen(false)}
        >
          <button
            type="button"
            onClick={() => setReceiptOpen(false)}
            aria-label="Close receipt"
            style={{ position: 'absolute', top: 14, right: 16, background: 'none', border: 'none', color: '#fff', fontSize: 30, lineHeight: 1, cursor: 'pointer' }}
          >
            ×
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={detail.receiptUrl}
            alt="Receipt"
            style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
          />
        </div>
      )}
    </div>
  )
}

function SkeletonExpenseItem() {
  return (
    <div className="tg-section" style={{ borderRadius: 12 }}>
      <div className="flex items-center gap-3 p-3">
        <div className="skeleton" style={{ width: 42, height: 42, borderRadius: 10, flexShrink: 0 }} />
        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="skeleton" style={{ height: 14, width: '55%', borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 11, width: '38%', borderRadius: 4 }} />
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <div className="skeleton" style={{ height: 10, width: 44, borderRadius: 4 }} />
          <div className="skeleton" style={{ height: 14, width: 60, borderRadius: 4 }} />
        </div>
      </div>
    </div>
  )
}

function SkeletonExpenseGroup({ count, first = false }: { count: number; first?: boolean }) {
  return (
    <div>
      <div className="flex items-center gap-2 px-1" style={{ paddingTop: first ? 8 : 16, paddingBottom: 8 }}>
        <div className="skeleton" style={{ width: 7, height: 7, borderRadius: '50%', flexShrink: 0 }} />
        <div className="skeleton" style={{ height: 10, width: 56, borderRadius: 3 }} />
        <div className="skeleton" style={{ height: 10, width: 48, borderRadius: 3 }} />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: count }).map((_, i) => <SkeletonExpenseItem key={i} />)}
      </div>
    </div>
  )
}

export function ExpensesPage() {
  const router = useRouter()
  const { chatId, group, members, currentMember, apiHeaders } = useAppContext()

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [detail, setDetail] = useState<DetailState | null>(null)

  const showSkeleton = useShowSkeleton(loading)
  const { refreshBalances } = useGroupData()

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

  const fetchBalance = refreshBalances // the header's "You owe" line and the Balances tab share one copy

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

  const handleDelete = (id: number, onSuccess?: () => void) => {
    const tg = window.Telegram?.WebApp
    const doDelete = async () => {
      try {
        await fetch(`/api/groups/${chatId}/expenses/${id}`, { method: 'DELETE', headers: apiHeaders })
        fetchExpenses(page)
        fetchBalance()
        onSuccess?.()
      } catch (e) {
        alert(String(e))
      }
    }
    if (tg) {
      tg.showConfirm('Delete this expense?', confirmed => { if (confirmed) doDelete() })
    } else if (confirm('Delete this expense?')) {
      doDelete()
    }
  }

  const handleDeleteSettlement = (id: number, onSuccess?: () => void) => {
    const tg = window.Telegram?.WebApp
    const doDelete = async () => {
      try {
        await fetch(`/api/groups/${chatId}/settlements/${id}`, { method: 'DELETE', headers: apiHeaders })
        fetchSettlements()
        fetchBalance()
        onSuccess?.()
      } catch (e) {
        alert(String(e))
      }
    }
    if (tg) {
      tg.showConfirm('Delete this payment record?', confirmed => { if (confirmed) doDelete() })
    } else if (confirm('Delete this payment record?')) {
      doDelete()
    }
  }

  const handleUpdateSettlement = async (
    id: number,
    data: { from_member_id: number; to_member_id: number; amount: number; currency: string }
  ) => {
    const res = await fetch(`/api/groups/${chatId}/settlements/${id}`, {
      method: 'PUT',
      headers: apiHeaders,
      body: JSON.stringify(data),
    })
    if (!res.ok) {
      const d = await res.json().catch(() => ({})) as { error?: string }
      throw new Error(d.error ?? `HTTP ${res.status}`)
    }
    const updated = await res.json() as Settlement
    setSettlements(prev => prev.map(s => s.id === id ? updated : s))
    setDetail(prev => prev?.kind === 'settlement' && prev.item.id === id ? { kind: 'settlement', item: updated } : prev)
    fetchBalance()
  }

  const openExpenseDetail = (exp: Expense) => {
    setDetail({ kind: 'expense', item: exp, splits: null })
    fetch(`/api/groups/${chatId}/expenses/${exp.id}`, { headers: apiHeaders })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        setDetail(prev =>
          prev?.kind === 'expense' && prev.item.id === exp.id
            ? { ...prev, splits: data ? (data.splits ?? []) : prev.splits, receiptUrl: data?.receipt_url ?? null, activity: data?.activity ?? [] }
            : prev
        )
      })
      .catch(() => {
        setDetail(prev =>
          prev?.kind === 'expense' && prev.item.id === exp.id ? { ...prev, receiptUrl: null } : prev
        )
      })
  }

  const openSettlementDetail = (s: Settlement) => {
    setDetail({ kind: 'settlement', item: s })
  }

  const navigate = (path: string) => router.push(`${path}?chatId=${chatId}`)

  const pageSize = 30
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <>
    <div className="flex flex-col h-full">
    {/* Scrollable list */}
    <div className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-fab">
      {showSkeleton && (
        <>
          <SkeletonExpenseGroup count={3} first />
          <SkeletonExpenseGroup count={2} />
        </>
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

      {(() => {
        const allItems = [
          ...expenses.map(e => ({ kind: 'expense' as const, ts: new Date(e.date).getTime(), dateStr: e.date, data: e })),
          ...settlements.map(s => ({ kind: 'settlement' as const, ts: new Date(s.created_at).getTime(), dateStr: s.created_at, data: s })),
        ].sort((a, b) => b.ts - a.ts)

        type ListItem = typeof allItems[number]
        const groups: Array<{ key: string; dateStr: string; items: ListItem[] }> = []
        for (const item of allItems) {
          const key = getDateKey(item.dateStr)
          const last = groups[groups.length - 1]
          if (last && last.key === key) { last.items.push(item) }
          else { groups.push({ key, dateStr: item.dateStr, items: [item] }) }
        }

        return groups.map((group, gi) => {
          const { date, day } = formatDateHeader(group.dateStr)
          return (
            <div key={group.key} style={{ marginBottom: gi < groups.length - 1 ? 12 : 0 }}>
              {/* Date header */}
              <div className="flex items-center gap-2 px-1" style={{ paddingTop: gi === 0 ? 8 : 16, paddingBottom: 8 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: 'var(--tg-theme-hint-color)', opacity: 0.5,
                }} />
                <span style={{ fontSize: '13px', fontWeight: 700 }}>{date}</span>
                <span style={{ fontSize: '13px', color: 'var(--tg-theme-hint-color)' }}>{day}</span>
              </div>

              {/* Items */}
              <div className="flex flex-col gap-2">
                {group.items.map(item => {
                  if (item.kind === 'settlement') {
                    const s = item.data
                    return (
                      <div
                        key={`s-${s.id}`}
                        className="tg-section"
                        style={{ borderRadius: '12px', cursor: 'pointer', WebkitTapHighlightColor: 'rgba(0,0,0,0.05)' }}
                        onClick={() => openSettlementDetail(s)}
                      >
                        <div className="flex items-center gap-3 p-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium">
                              {s.from_name} paid {s.to_name}{' '}
                              <span className="font-bold">{s.currency} {Number(s.amount).toFixed(2)}</span>
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>Settlement</p>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span
                              className="text-xs font-semibold px-2 py-0.5 rounded-full"
                              style={{ background: 'rgba(52,199,89,0.15)', color: '#34c759' }}
                            >
                              Paid
                            </span>
                            <span style={{ color: 'var(--tg-theme-hint-color)', fontSize: '18px', lineHeight: 1 }}>›</span>
                          </div>
                        </div>
                      </div>
                    )
                  }

                  const exp = item.data
                  const myAmt = exp.my_split_amount != null ? Number(exp.my_split_amount) : null
                  const isPayer = exp.paid_by_member_id === currentMember.id
                  const expTotal = Number(exp.total_amount)
                  const isSolo = myAmt !== null && isPayer && expTotal - myAmt <= 0.005
                  let myVerbLabel: string | null = null
                  let myAmtDisplay: string | null = null
                  let myLabelColor = 'var(--tg-theme-hint-color)'
                  if (!isSolo && myAmt !== null) {
                    if (isPayer && expTotal - myAmt > 0.005) {
                      myVerbLabel = 'You lent'
                      myAmtDisplay = `${exp.currency} ${(expTotal - myAmt).toFixed(2)}`
                      myLabelColor = 'var(--tg-theme-button-color)'
                    } else if (!isPayer && myAmt > 0.005) {
                      myVerbLabel = 'You borrowed'
                      myAmtDisplay = `${exp.currency} ${myAmt.toFixed(2)}`
                      myLabelColor = 'var(--tg-theme-destructive-text-color, #ff3b30)'
                    }
                  }
                  const notInvolved = !isSolo && myVerbLabel === null
                  return (
                    <div
                      key={`e-${exp.id}`}
                      className="tg-section"
                      style={{ borderRadius: '12px', cursor: 'pointer', WebkitTapHighlightColor: 'rgba(0,0,0,0.05)', opacity: notInvolved ? 0.55 : 1  }}
                      onClick={() => openExpenseDetail(exp)}
                    >
                      <div className="flex items-center gap-3 p-3">
                        <div
                          className="flex items-center justify-center flex-shrink-0"
                          style={{ width: 42, height: 42, borderRadius: 10, background: 'var(--tg-theme-secondary-bg-color)', fontSize: '22px' }}
                        >
                          {exp.category ? exp.category.split(' ')[0] : '🧾'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-base truncate">
                            {exp.description}
                            {exp.has_receipt && <span aria-label="Has receipt" style={{ marginLeft: 6, fontSize: 12 }}>📎</span>}
                          </p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
                            {isSolo ? 'You paid for yourself' : `${exp.paid_by_name ?? '?'} paid ${exp.currency} ${expTotal.toFixed(2)}`}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          {myVerbLabel ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <p className="text-xs" style={{ color: myLabelColor }}>{myVerbLabel}</p>
                              <p className="font-bold text-base" style={{ color: myLabelColor }}>{myAmtDisplay}</p>
                            </div>
                          ) : (
                            <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>{isSolo ? 'No balance' : 'Not involved'}</p>
                          )}
                          <span style={{ color: 'var(--tg-theme-hint-color)', fontSize: '18px', lineHeight: 1 }}>›</span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })
      })()}

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

    </div>

    {detail && (
      <DetailPanel
        detail={detail}
        members={members}
        onClose={() => setDetail(null)}
        onEdit={id => navigate(`/edit/${id}`)}
        onDeleteExpense={id => handleDelete(id, () => setDetail(null))}
        onDeleteSettlement={id => handleDeleteSettlement(id, () => setDetail(null))}
        onUpdateSettlement={handleUpdateSettlement}
        currentMemberId={currentMember.id}
      />
    )}
    </>
  )
}
