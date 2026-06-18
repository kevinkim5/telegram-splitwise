'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppContext } from '@/components/AppProvider'
import { CurrencyPicker } from '@/components/CurrencyPicker'
import type { Expense } from '@/types'

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function ExpensesPage() {
  const router = useRouter()
  const { chatId, group, apiHeaders, refreshGroup } = useAppContext()

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)

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

  useEffect(() => { fetchExpenses(page) }, [fetchExpenses, page])

  const handleDelete = (id: number) => {
    const tg = window.Telegram?.WebApp
    const doDelete = async () => {
      setDeletingId(id)
      try {
        await fetch(`/api/groups/${chatId}/expenses/${id}`, { method: 'DELETE', headers: apiHeaders })
        fetchExpenses(page)
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

  const handleCurrencySelect = async (currency: string) => {
    try {
      await fetch(`/api/groups/${chatId}/settings`, {
        method: 'PUT',
        headers: apiHeaders,
        body: JSON.stringify({ currency }),
      })
      await refreshGroup()
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')
    } catch {
      // ignore
    }
    setShowCurrencyPicker(false)
  }

  const pageSize = 30
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <>
    <div className="p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h1 className="font-bold text-lg leading-tight">{group.title}</h1>
          <button
            onClick={() => setShowCurrencyPicker(true)}
            className="text-xs mt-0.5 flex items-center gap-1"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--tg-theme-link-color)',
              padding: 0,
            }}
          >
            {group.currency} · {total} expense{total !== 1 ? 's' : ''} ✎
          </button>
        </div>
        <button
          onClick={() => navigate('/add')}
          className="tg-btn"
          style={{ width: 'auto', padding: '8px 16px', borderRadius: '20px', fontSize: '15px' }}
        >
          + Add
        </button>
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

      {!loading && !error && expenses.length === 0 && (
        <div className="flex flex-col items-center py-16 gap-3">
          <div className="text-5xl">🧾</div>
          <p className="font-medium">No expenses yet</p>
          <p className="text-sm" style={{ color: 'var(--tg-theme-hint-color)' }}>
            Tap + Add to record your first expense
          </p>
        </div>
      )}

      {/* Expense list */}
      <div className="flex flex-col gap-2">
        {expenses.map(exp => (
          <div
            key={exp.id}
            className="tg-section"
            style={{ borderRadius: '12px' }}
          >
            <div className="flex items-start gap-3 p-3">
              {/* Left: info */}
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-base truncate">{exp.description}</p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
                  Paid by {exp.paid_by_name ?? '?'}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--tg-theme-hint-color)' }}>
                  {formatDate(exp.date)}
                </p>
              </div>

              {/* Right: amount + actions */}
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                <p className="font-bold text-base">
                  {group.currency} {Number(exp.total_amount).toFixed(2)}
                </p>
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
        ))}
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

    {showCurrencyPicker && (
      <CurrencyPicker
        current={group.currency}
        onSelect={handleCurrencySelect}
        onClose={() => setShowCurrencyPicker(false)}
      />
    )}
    </>
  )
}
