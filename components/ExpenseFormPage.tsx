'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { AppContext, Expense } from '@/types'

interface Props {
  ctx: AppContext
  editId?: string
}

export function ExpenseFormPage({ ctx, editId }: Props) {
  const router = useRouter()
  const { chatId, members } = ctx
  const isEdit = !!editId

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('USD')
  const [paidBy, setPaidBy] = useState<number>(ctx.currentMember.id)
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [selectedMembers, setSelectedMembers] = useState<number[]>(members.map(m => m.id))
  const [customAmounts, setCustomAmounts] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isEdit) return
    const load = async () => {
      try {
        const res = await fetch(`/api/groups/${chatId}/expenses/${editId}`, {
          headers: { 'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData ?? '' },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const exp: Expense = await res.json()
        setDescription(exp.description)
        setAmount(String(exp.total_amount))
        setCurrency(exp.currency)
        setPaidBy(exp.paid_by.id)
        setSplitType(exp.split_type)
        const ids = exp.splits.map(s => s.member_id)
        setSelectedMembers(ids)
        if (exp.split_type === 'custom') {
          const ca: Record<number, string> = {}
          exp.splits.forEach(s => { ca[s.member_id] = String(s.amount) })
          setCustomAmounts(ca)
        }
      } catch (e) {
        setError(String(e))
      }
    }
    load()
  }, [isEdit, editId, chatId])

  const toggleMember = (id: number) => {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (selectedMembers.length === 0) { setError('Select at least one member to split with.'); return }
    const totalAmt = parseFloat(amount)
    if (isNaN(totalAmt) || totalAmt <= 0) { setError('Enter a valid amount.'); return }

    const splits = splitType === 'equal'
      ? selectedMembers.map(id => ({ member_id: id }))
      : selectedMembers.map(id => ({ member_id: id, amount: parseFloat(customAmounts[id] ?? '0') || 0 }))

    const body = {
      description,
      total_amount: totalAmt,
      currency,
      paid_by_member_id: paidBy,
      split_type: splitType,
      splits,
    }

    setSubmitting(true)
    setError(null)
    try {
      const url = isEdit
        ? `/api/groups/${chatId}/expenses/${editId}`
        : `/api/groups/${chatId}/expenses`
      const method = isEdit ? 'PUT' : 'POST'
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData ?? '',
        },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? `HTTP ${res.status}`)
      }
      router.push('/')
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.6rem 0.75rem',
    borderRadius: '8px',
    border: '1px solid var(--tg-theme-hint-color, #ccc)',
    background: 'var(--tg-theme-secondary-bg-color, #f5f5f5)',
    color: 'var(--tg-theme-text-color, #000)',
    fontSize: '1rem',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '0.85rem',
    fontWeight: 600,
    marginBottom: '0.3rem',
    color: 'var(--tg-theme-hint-color, #666)',
  }

  return (
    <div style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <button
          onClick={() => router.push('/')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: 'var(--tg-theme-button-color, #2481cc)' }}
        >
          ← Back
        </button>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 700 }}>{isEdit ? 'Edit Expense' : 'Add Expense'}</h1>
      </div>

      {error && (
        <p style={{ color: '#e53e3e', marginBottom: '1rem', fontSize: '0.9rem' }}>{error}</p>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div>
          <label style={labelStyle}>Description</label>
          <input
            style={inputStyle}
            value={description}
            onChange={e => setDescription(e.target.value)}
            required
            placeholder="Dinner, groceries…"
          />
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <div style={{ flex: 2 }}>
            <label style={labelStyle}>Amount</label>
            <input
              style={inputStyle}
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
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Currency</label>
            <select style={inputStyle} value={currency} onChange={e => setCurrency(e.target.value)}>
              {['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'KRW', 'CNY', 'INR'].map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label style={labelStyle}>Paid by</label>
          <select style={inputStyle} value={paidBy} onChange={e => setPaidBy(Number(e.target.value))}>
            {members.map(m => (
              <option key={m.id} value={m.id}>
                {m.first_name}{m.last_name ? ` ${m.last_name}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label style={labelStyle}>Split</label>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
            {(['equal', 'custom'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setSplitType(type)}
                style={{
                  flex: 1,
                  padding: '0.5rem',
                  borderRadius: '8px',
                  border: '1px solid var(--tg-theme-hint-color, #ccc)',
                  background: splitType === type ? 'var(--tg-theme-button-color, #2481cc)' : 'none',
                  color: splitType === type ? 'var(--tg-theme-button-text-color, #fff)' : 'var(--tg-theme-text-color, #000)',
                  cursor: 'pointer',
                  fontWeight: splitType === type ? 600 : 400,
                }}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {members.map(m => {
              const checked = selectedMembers.includes(m.id)
              return (
                <div
                  key={m.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.5rem 0.75rem',
                    borderRadius: '8px',
                    background: 'var(--tg-theme-secondary-bg-color, #f5f5f5)',
                    cursor: 'pointer',
                  }}
                  onClick={() => toggleMember(m.id)}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleMember(m.id)}
                    onClick={e => e.stopPropagation()}
                    style={{ width: '18px', height: '18px', cursor: 'pointer' }}
                  />
                  <span style={{ flex: 1 }}>
                    {m.first_name}{m.last_name ? ` ${m.last_name}` : ''}
                    {m.username ? ` (@${m.username})` : ''}
                  </span>
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
                      style={{ ...inputStyle, width: '90px' }}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          style={{
            marginTop: '0.5rem',
            padding: '0.75rem',
            background: 'var(--tg-theme-button-color, #2481cc)',
            color: 'var(--tg-theme-button-text-color, #fff)',
            border: 'none',
            borderRadius: '10px',
            fontSize: '1rem',
            fontWeight: 700,
            cursor: submitting ? 'not-allowed' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}
        >
          {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Expense'}
        </button>
      </form>
    </div>
  )
}
