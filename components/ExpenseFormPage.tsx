'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppContext } from '@/components/AppProvider'
import { CurrencyPicker, CURRENCIES } from '@/components/CurrencyPicker'
import type { Expense } from '@/types'

interface Props {
  editId?: string
}

const CATEGORIES = [
  '🍜 Food',
  '🍺 Drinks',
  '🏨 Stay',
  '✈️ Flights',
  '🚌 Transport',
  '🚕 Taxi',
  '🎡 Activities',
  '🛒 Shopping',
  '💊 Medical',
  '📦 Other',
]

export function ExpenseFormPage({ editId }: Props) {
  const router = useRouter()
  const { chatId, group, members, currentMember, apiHeaders } = useAppContext()
  const isEdit = !!editId

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [paidBy, setPaidBy] = useState<number>(currentMember.id)
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [selectedMembers, setSelectedMembers] = useState<number[]>(members.map(m => m.id))
  const [customAmounts, setCustomAmounts] = useState<Record<number, string>>({})
  const [category, setCategory] = useState<string>('')
  const [expenseCurrency, setExpenseCurrency] = useState<string>('SGD')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [error, setError] = useState<string | null>(null)
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)

  useEffect(() => {
    if (!isEdit || !editId) return
    const load = async () => {
      try {
        const res = await fetch(`/api/groups/${chatId}/expenses/${editId}`, { headers: apiHeaders })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const exp: Expense & { splits: Array<{ member_id: number; amount: number }> } = await res.json()
        setDescription(exp.description)
        setAmount(String(exp.total_amount))
        setDate(exp.date ? exp.date.split('T')[0] : new Date().toISOString().split('T')[0])
        setPaidBy(exp.paid_by_member_id)
        setSplitType(exp.split_type)
        setCategory(exp.category ?? '')
        setExpenseCurrency(exp.currency ?? 'SGD')
        const ids = (exp.splits ?? []).map(s => s.member_id)
        setSelectedMembers(ids.length ? ids : members.map(m => m.id))
        if (exp.split_type === 'custom') {
          const ca: Record<number, string> = {}
          ;(exp.splits ?? []).forEach(s => { ca[s.member_id] = String(s.amount) })
          setCustomAmounts(ca)
        }
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [isEdit, editId, chatId, apiHeaders, members])

  const toggleMember = (id: number) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const totalAmt = parseFloat(amount) || 0
  const perPerson = selectedMembers.length > 0 && totalAmt > 0
    ? (totalAmt / selectedMembers.length).toFixed(2)
    : null

  const customSum = selectedMembers.reduce((sum, id) => sum + (parseFloat(customAmounts[id] ?? '0') || 0), 0)

  const navigate = (path: string) => router.push(`${path}?chatId=${chatId}`)

  const handleCurrencySelect = (currency: string) => {
    setExpenseCurrency(currency)
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()
    setShowCurrencyPicker(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (selectedMembers.length === 0) { setError('Select at least one person to split with.'); return }
    if (isNaN(totalAmt) || totalAmt <= 0) { setError('Enter a valid positive amount.'); return }

    if (splitType === 'custom') {
      if (Math.abs(customSum - totalAmt) > 0.02) {
        setError(`Custom amounts sum to ${customSum.toFixed(2)} but total is ${totalAmt.toFixed(2)}. They must match.`)
        return
      }
    }

    const splits = splitType === 'equal'
      ? selectedMembers.map(id => ({ member_id: id }))
      : selectedMembers.map(id => ({ member_id: id, amount: parseFloat(customAmounts[id] ?? '0') || 0 }))

    const body = {
      description,
      total_amount: totalAmt,
      currency: expenseCurrency,
      paid_by_member_id: paidBy,
      split_type: splitType,
      splits,
      date,
      category: category || null,
    }

    setSubmitting(true)
    try {
      const url = isEdit
        ? `/api/groups/${chatId}/expenses/${editId}`
        : `/api/groups/${chatId}/expenses`
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, { method, headers: apiHeaders, body: JSON.stringify(body) })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error((data as { error?: string }).error ?? `HTTP ${res.status}`)
      }
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')
      navigate('/')
    } catch (e) {
      setError(String(e))
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <p style={{ color: 'var(--tg-theme-hint-color)' }}>Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <button
          onClick={() => navigate('/')}
          className="text-sm font-medium"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg-theme-link-color)' }}
        >
          ← Back
        </button>
        <h1 className="text-lg font-bold">{isEdit ? 'Edit Expense' : 'Add Expense'}</h1>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(255,59,48,0.1)', color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        {/* Description */}
        <div>
          <p className="tg-label">Description</p>
          <div className="tg-section">
            <input
              className="tg-input"
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
              placeholder="Dinner, groceries, taxi…"
            />
          </div>
        </div>

        {/* Category */}
        <div>
          <p className="tg-label">Category</p>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategory(prev => prev === cat ? '' : cat)}
                className="text-sm px-3 py-1.5 rounded-full"
                style={{
                  border: 'none',
                  cursor: 'pointer',
                  background: category === cat
                    ? 'var(--tg-theme-button-color)'
                    : 'var(--tg-theme-section-bg-color)',
                  color: category === cat
                    ? 'var(--tg-theme-button-text-color)'
                    : 'var(--tg-theme-text-color)',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Amount + Currency */}
        <div>
          <p className="tg-label">Amount</p>
          <div className="tg-section" style={{ display: 'flex', alignItems: 'stretch' }}>
            <button
              type="button"
              onClick={() => setShowCurrencyPicker(true)}
              style={{
                color: 'var(--tg-theme-text-color)',
                fontSize: '15px',
                fontWeight: '600',
                padding: '12px 10px 12px 16px',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: 'none',
                border: 'none',
                borderRight: '1px solid rgba(0,0,0,0.1)',
                cursor: 'pointer',
              }}
            >
              <span>{CURRENCIES.find(c => c.code === expenseCurrency)?.flag ?? ''}</span>
              <span>{expenseCurrency}</span>
            </button>
            <input
              className="tg-input"
              style={{ paddingLeft: '10px' }}
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              required
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Date */}
        <div>
          <p className="tg-label">Date</p>
          <div className="tg-section">
            <input
              className="tg-input"
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              required
            />
          </div>
        </div>

        {/* Paid by */}
        <div>
          <p className="tg-label">Paid by</p>
          <div className="tg-section">
            <select
              className="tg-input"
              value={paidBy}
              onChange={e => setPaidBy(Number(e.target.value))}
            >
              {members.map(m => (
                <option key={m.id} value={m.id}>
                  {m.first_name}{m.last_name ? ` ${m.last_name}` : ''}
                  {m.id === currentMember.id ? ' (you)' : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Split type toggle */}
        <div>
          <p className="tg-label">Split type</p>
          <div className="flex gap-2 mb-3">
            {(['equal', 'custom'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setSplitType(type)}
                className="flex-1 py-2 rounded-xl text-sm font-medium transition-colors"
                style={{
                  border: 'none',
                  background: splitType === type ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-section-bg-color)',
                  color: splitType === type ? 'var(--tg-theme-button-text-color)' : 'var(--tg-theme-text-color)',
                  cursor: 'pointer',
                }}
              >
                {type === 'equal' ? '⚖️ Equal' : '✏️ Custom'}
              </button>
            ))}
          </div>

          {/* Member selection */}
          <div className="tg-section">
            {members.map((m, idx) => {
              const checked = selectedMembers.includes(m.id)
              const isLast = idx === members.length - 1
              return (
                <div
                  key={m.id}
                  className="tg-list-item flex items-center gap-3 cursor-pointer select-none"
                  style={{ borderBottom: isLast ? 'none' : undefined }}
                  onClick={() => toggleMember(m.id)}
                >
                  {/* Checkbox */}
                  <div
                    className="w-5 h-5 rounded flex items-center justify-center flex-shrink-0"
                    style={{
                      background: checked ? 'var(--tg-theme-button-color)' : 'transparent',
                      border: checked ? 'none' : '1.5px solid var(--tg-theme-hint-color)',
                    }}
                  >
                    {checked && <span className="text-white text-xs font-bold">✓</span>}
                  </div>

                  {/* Name */}
                  <span className="flex-1 text-sm">
                    {m.first_name}{m.last_name ? ` ${m.last_name}` : ''}
                    {m.id === currentMember.id ? (
                      <span style={{ color: 'var(--tg-theme-hint-color)' }}> (you)</span>
                    ) : null}
                  </span>

                  {/* Equal: show per-person amount */}
                  {splitType === 'equal' && checked && perPerson && (
                    <span className="text-sm font-medium" style={{ color: 'var(--tg-theme-hint-color)' }}>
                      {expenseCurrency} {perPerson}
                    </span>
                  )}

                  {/* Custom: amount input */}
                  {splitType === 'custom' && checked && (
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={customAmounts[m.id] ?? ''}
                      onChange={e => setCustomAmounts(prev => ({ ...prev, [m.id]: e.target.value }))}
                      onClick={e => e.stopPropagation()}
                      placeholder="0.00"
                      className="text-right"
                      style={{
                        width: '80px',
                        padding: '4px 8px',
                        borderRadius: '8px',
                        border: '1px solid var(--tg-theme-hint-color)',
                        background: 'var(--tg-theme-secondary-bg-color)',
                        color: 'var(--tg-theme-text-color)',
                        fontSize: '16px',
                      }}
                    />
                  )}
                </div>
              )
            })}
          </div>

          {/* Custom split summary */}
          {splitType === 'custom' && totalAmt > 0 && (
            <div className="mt-2 px-1">
              <p className="text-xs" style={{
                color: Math.abs(customSum - totalAmt) < 0.02
                  ? 'var(--tg-theme-hint-color)'
                  : 'var(--tg-theme-destructive-text-color, #ff3b30)',
              }}>
                Split total: {expenseCurrency} {customSum.toFixed(2)} / {totalAmt.toFixed(2)}
                {Math.abs(customSum - totalAmt) < 0.02 ? ' ✓' : ` (${(totalAmt - customSum).toFixed(2)} remaining)`}
              </p>
            </div>
          )}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="tg-btn"
          style={{ opacity: submitting ? 0.7 : 1, cursor: submitting ? 'not-allowed' : 'pointer' }}
        >
          {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Expense'}
        </button>
      </form>

      {showCurrencyPicker && (
        <CurrencyPicker
          current={group.currency}
          onSelect={handleCurrencySelect}
          onClose={() => setShowCurrencyPicker(false)}
        />
      )}
    </div>
  )
}
