import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AppContext } from '../App'
import type { Expense } from '../types'
import { expensesApi } from '../api'

function memberDisplay(m: { first_name: string; last_name?: string | null }) {
  return m.last_name ? `${m.first_name} ${m.last_name}` : m.first_name
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export function ExpensesPage({ ctx }: { ctx: AppContext }) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const load = async () => {
    setLoading(true)
    try {
      const res = await expensesApi.list(ctx.chatId)
      setExpenses(res.items)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [ctx.chatId])

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--tg-theme-hint-color)' }}>
        Loading...
      </div>
    )
  }

  return (
    <div style={{ padding: '12px' }}>
      <h2 style={{ marginBottom: '12px', fontSize: '18px' }}>Expenses</h2>
      {expenses.length === 0 && (
        <div style={{ textAlign: 'center', color: 'var(--tg-theme-hint-color)', marginTop: '3rem' }}>
          <p>No expenses yet.</p>
          <p style={{ fontSize: '14px', marginTop: '8px' }}>Tap Add to record the first one.</p>
        </div>
      )}
      {expenses.map(expense => (
        <div
          key={expense.id}
          onClick={() => navigate(`/edit/${expense.id}`)}
          style={{
            background: 'var(--tg-theme-secondary-bg-color, #f5f5f5)',
            borderRadius: '12px', padding: '14px', marginBottom: '10px',
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: '600', fontSize: '15px' }}>{expense.description}</div>
              <div style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color)', marginTop: '2px' }}>
                Paid by {memberDisplay(expense.paid_by)} · {formatDate(expense.created_at)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color)', marginTop: '2px' }}>
                Split: {expense.splits.map(s => s.first_name).join(', ')}
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: '12px' }}>
              <div style={{ fontWeight: '700', fontSize: '16px' }}>
                {expense.currency} {expense.total_amount.toFixed(2)}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color)', marginTop: '2px' }}>
                {expense.split_type === 'equal' ? 'split equally' : 'custom split'}
              </div>
              {(() => {
                const myShare = expense.splits.find(s => s.member_id === ctx.currentMember.id)
                if (!myShare) return null
                return (
                  <div style={{ fontSize: '12px', color: 'var(--tg-theme-button-color, #2196f3)', marginTop: '2px' }}>
                    Your share: {expense.currency} {myShare.amount.toFixed(2)}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
