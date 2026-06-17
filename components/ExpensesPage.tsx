'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import type { AppContext, Expense } from '@/types'

function memberName(m: { first_name: string; last_name: string | null }) {
  return m.last_name ? `${m.first_name} ${m.last_name}` : m.first_name
}

export function ExpensesPage({ ctx }: { ctx: AppContext }) {
  const router = useRouter()
  const { chatId } = ctx

  const [expenses, setExpenses] = useState<Expense[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchExpenses = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/groups/${chatId}/expenses?page=${p}`, {
        headers: { 'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData ?? '' },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setExpenses(data.items)
      setTotal(data.total)
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [chatId])

  useEffect(() => {
    fetchExpenses(page)
  }, [fetchExpenses, page])

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this expense?')) return
    try {
      await fetch(`/api/groups/${chatId}/expenses/${id}`, {
        method: 'DELETE',
        headers: { 'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData ?? '' },
      })
      fetchExpenses(page)
    } catch (e) {
      alert(String(e))
    }
  }

  const pageSize = 30
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Expenses</h1>
        <button
          onClick={() => router.push('/add')}
          style={{
            background: 'var(--tg-theme-button-color, #2481cc)',
            color: 'var(--tg-theme-button-text-color, #fff)',
            border: 'none',
            borderRadius: '8px',
            padding: '0.5rem 1rem',
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          + Add
        </button>
      </div>

      {loading && <p style={{ color: 'var(--tg-theme-hint-color, #999)', textAlign: 'center' }}>Loading…</p>}
      {error && <p style={{ color: '#e53e3e', textAlign: 'center' }}>{error}</p>}

      {!loading && !error && expenses.length === 0 && (
        <p style={{ color: 'var(--tg-theme-hint-color, #999)', textAlign: 'center', marginTop: '2rem' }}>
          No expenses yet. Tap + Add to create one.
        </p>
      )}

      <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {expenses.map(exp => (
          <li
            key={exp.id}
            style={{
              background: 'var(--tg-theme-secondary-bg-color, #f5f5f5)',
              borderRadius: '10px',
              padding: '0.75rem 1rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0, marginRight: '0.5rem' }}>
                <p style={{ fontWeight: 600, marginBottom: '0.2rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {exp.description}
                </p>
                <p style={{ fontSize: '0.85rem', color: 'var(--tg-theme-hint-color, #999)' }}>
                  {exp.currency} {exp.total_amount.toFixed(2)} · paid by {memberName(exp.paid_by)}
                </p>
                <p style={{ fontSize: '0.75rem', color: 'var(--tg-theme-hint-color, #999)', marginTop: '0.2rem' }}>
                  {new Date(exp.created_at).toLocaleDateString()}
                </p>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  onClick={() => router.push(`/edit/${exp.id}`)}
                  style={{
                    background: 'none',
                    border: '1px solid var(--tg-theme-hint-color, #ccc)',
                    borderRadius: '6px',
                    padding: '0.3rem 0.6rem',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    color: 'var(--tg-theme-text-color, #000)',
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(exp.id)}
                  style={{
                    background: 'none',
                    border: '1px solid #e53e3e',
                    borderRadius: '6px',
                    padding: '0.3rem 0.6rem',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    color: '#e53e3e',
                  }}
                >
                  Del
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
          <button
            disabled={page <= 1}
            onClick={() => setPage(p => p - 1)}
            style={{ padding: '0.4rem 0.8rem', cursor: page > 1 ? 'pointer' : 'not-allowed', opacity: page <= 1 ? 0.4 : 1 }}
          >
            ←
          </button>
          <span style={{ fontSize: '0.85rem', color: 'var(--tg-theme-hint-color, #999)' }}>
            {page} / {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
            style={{ padding: '0.4rem 0.8rem', cursor: page < totalPages ? 'pointer' : 'not-allowed', opacity: page >= totalPages ? 0.4 : 1 }}
          >
            →
          </button>
        </div>
      )}
    </div>
  )
}
