import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { AppContext } from '../App'
import { expensesApi } from '../api'

const COMMON_CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'JPY', 'MYR', 'AUD', 'HKD']

export function ExpenseFormPage({ ctx }: { ctx: AppContext }) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [currency, setCurrency] = useState('SGD')
  const [customCurrency, setCustomCurrency] = useState('')
  const [paidByMemberId, setPaidByMemberId] = useState<number | null>(ctx.currentMember.id)
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<number>>(
    new Set(ctx.members.map(m => m.id))
  )
  const [splitType, setSplitType] = useState<'equal' | 'custom'>('equal')
  const [customAmounts, setCustomAmounts] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingExpense, setLoadingExpense] = useState(isEdit)

  useEffect(() => {
    if (!isEdit) return
    expensesApi.get(ctx.chatId, Number(id)).then(exp => {
      setDescription(exp.description)
      setAmount(String(exp.total_amount))
      const curr = exp.currency
      if (COMMON_CURRENCIES.includes(curr)) {
        setCurrency(curr)
        setCustomCurrency('')
      } else {
        setCurrency('custom')
        setCustomCurrency(curr)
      }
      setPaidByMemberId(exp.paid_by.id)
      setSelectedMemberIds(new Set(exp.splits.map(s => s.member_id)))
      setSplitType(exp.split_type)
      const ca: Record<number, string> = {}
      for (const s of exp.splits) ca[s.member_id] = String(s.amount)
      setCustomAmounts(ca)
      setLoadingExpense(false)
    }).catch(e => {
      setError(String(e))
      setLoadingExpense(false)
    })
  }, [id, isEdit, ctx.chatId])

  const activeCurrency = currency === 'custom' ? customCurrency : currency

  const toggleMember = (memberId: number) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  const handleSubmit = async () => {
    setError(null)
    if (!description.trim()) { setError('Description is required'); return }
    const totalAmount = parseFloat(amount)
    if (!amount || isNaN(totalAmount) || totalAmount <= 0) { setError('Enter a valid amount'); return }
    if (!paidByMemberId) { setError('Select who paid'); return }
    if (selectedMemberIds.size === 0) { setError('Select at least one person to split with'); return }
    if (!activeCurrency.trim()) { setError('Enter a currency'); return }

    const selectedIds = Array.from(selectedMemberIds)
    let splits: { member_id: number; amount?: number }[]

    if (splitType === 'equal') {
      splits = selectedIds.map(mid => ({ member_id: mid }))
    } else {
      const parsed = selectedIds.map(mid => ({
        member_id: mid,
        amount: parseFloat(customAmounts[mid] || '0'),
      }))
      const sum = parsed.reduce((a, s) => a + (s.amount || 0), 0)
      if (Math.abs(sum - totalAmount) > 0.01) {
        setError(
          `Custom amounts must sum to ${activeCurrency} ${totalAmount.toFixed(2)} (currently ${sum.toFixed(2)})`
        )
        return
      }
      splits = parsed
    }

    setSubmitting(true)
    try {
      const body = {
        description: description.trim(),
        total_amount: totalAmount,
        currency: activeCurrency.toUpperCase().trim(),
        paid_by_member_id: paidByMemberId,
        split_type: splitType,
        splits,
      }
      if (isEdit) {
        await expensesApi.update(ctx.chatId, Number(id), body)
      } else {
        await expensesApi.create(ctx.chatId, body)
      }
      navigate('/')
    } catch (e) {
      setError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async () => {
    if (!isEdit) return
    setDeleting(true)
    try {
      await expensesApi.delete(ctx.chatId, Number(id))
      navigate('/')
    } catch (e) {
      setError(String(e))
      setDeleting(false)
    }
  }

  if (loadingExpense) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--tg-theme-hint-color)' }}>
        Loading...
      </div>
    )
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px',
    border: '1px solid var(--tg-theme-hint-color, #ddd)',
    borderRadius: '8px', fontSize: '15px',
    background: 'var(--tg-theme-secondary-bg-color, #f5f5f5)',
    color: 'var(--tg-theme-text-color, #000)',
    outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '13px', fontWeight: '600',
    color: 'var(--tg-theme-hint-color)', marginBottom: '6px', marginTop: '16px',
    textTransform: 'uppercase', letterSpacing: '0.5px',
  }

  const customTotal = Array.from(selectedMemberIds).reduce(
    (sum, mid) => sum + parseFloat(customAmounts[mid] || '0'), 0
  )

  return (
    <div style={{ padding: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '4px', color: 'var(--tg-theme-text-color)' }}
          >
            ←
          </button>
          <h2 style={{ fontSize: '18px' }}>{isEdit ? 'Edit Expense' : 'Add Expense'}</h2>
        </div>
        {isEdit && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{ background: 'none', border: 'none', color: '#e53935', fontSize: '14px', cursor: 'pointer' }}
          >
            {deleting ? 'Deleting...' : 'Delete'}
          </button>
        )}
      </div>

      {error && (
        <div style={{
          background: '#ffebee', color: '#c62828', padding: '10px 12px',
          borderRadius: '8px', marginBottom: '12px', fontSize: '14px',
        }}>
          {error}
        </div>
      )}

      <label style={labelStyle}>Description</label>
      <input
        style={inputStyle}
        placeholder="e.g. Pizza, Taxi, Hotel"
        value={description}
        onChange={e => setDescription(e.target.value)}
      />

      <label style={labelStyle}>Amount & Currency</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        <input
          style={{ ...inputStyle, flex: 1 }}
          placeholder="0.00"
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={e => setAmount(e.target.value)}
        />
        <select
          style={{ ...inputStyle, width: 'auto', minWidth: '80px', flex: '0 0 auto' }}
          value={currency}
          onChange={e => setCurrency(e.target.value)}
        >
          {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="custom">Other</option>
        </select>
      </div>
      {currency === 'custom' && (
        <input
          style={{ ...inputStyle, marginTop: '8px' }}
          placeholder="Currency code, e.g. THB"
          value={customCurrency}
          onChange={e => setCustomCurrency(e.target.value.toUpperCase())}
        />
      )}

      <label style={labelStyle}>Paid by</label>
      <select
        style={inputStyle}
        value={paidByMemberId ?? ''}
        onChange={e => setPaidByMemberId(Number(e.target.value))}
      >
        <option value="">Select member</option>
        {ctx.members.map(m => (
          <option key={m.id} value={m.id}>
            {m.first_name}{m.last_name ? ' ' + m.last_name : ''}
            {m.id === ctx.currentMember.id ? ' (You)' : ''}
          </option>
        ))}
      </select>

      <label style={labelStyle}>Split with</label>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
        {ctx.members.map(m => {
          const selected = selectedMemberIds.has(m.id)
          return (
            <button
              key={m.id}
              onClick={() => toggleMember(m.id)}
              style={{
                padding: '8px 14px', borderRadius: '20px', border: '1.5px solid',
                borderColor: selected
                  ? 'var(--tg-theme-button-color, #2196f3)'
                  : 'var(--tg-theme-hint-color, #ddd)',
                background: selected ? 'var(--tg-theme-button-color, #2196f3)' : 'transparent',
                color: selected
                  ? 'var(--tg-theme-button-text-color, #fff)'
                  : 'var(--tg-theme-text-color, #000)',
                cursor: 'pointer', fontSize: '14px', fontWeight: selected ? '600' : '400',
              }}
            >
              {m.first_name}{m.id === ctx.currentMember.id ? ' (You)' : ''}
            </button>
          )
        })}
      </div>

      <label style={labelStyle}>Split type</label>
      <div style={{ display: 'flex', gap: '8px' }}>
        {(['equal', 'custom'] as const).map(type => (
          <button
            key={type}
            onClick={() => setSplitType(type)}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px', border: '1.5px solid',
              borderColor: splitType === type
                ? 'var(--tg-theme-button-color, #2196f3)'
                : 'var(--tg-theme-hint-color, #ddd)',
              background: splitType === type
                ? 'var(--tg-theme-button-color, #2196f3)'
                : 'transparent',
              color: splitType === type
                ? 'var(--tg-theme-button-text-color, #fff)'
                : 'var(--tg-theme-text-color, #000)',
              cursor: 'pointer', fontSize: '14px', fontWeight: '500',
            }}
          >
            {type === 'equal' ? 'Equal' : 'Custom amounts'}
          </button>
        ))}
      </div>

      {splitType === 'custom' && (
        <div style={{ marginTop: '12px' }}>
          {Array.from(selectedMemberIds).map(mid => {
            const member = ctx.members.find(m => m.id === mid)
            if (!member) return null
            return (
              <div key={mid} style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ flex: 1, fontSize: '14px' }}>
                  {member.first_name}{member.id === ctx.currentMember.id ? ' (You)' : ''}
                </span>
                <input
                  style={{ ...inputStyle, width: '130px', flex: '0 0 auto' }}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={customAmounts[mid] || ''}
                  onChange={e => setCustomAmounts(prev => ({ ...prev, [mid]: e.target.value }))}
                />
              </div>
            )
          })}
          <div style={{ fontSize: '13px', color: 'var(--tg-theme-hint-color)', textAlign: 'right', marginTop: '4px' }}>
            Total: {activeCurrency} {customTotal.toFixed(2)}
            {' / '}
            {activeCurrency} {parseFloat(amount || '0').toFixed(2)}
          </div>
        </div>
      )}

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: '100%', marginTop: '24px', marginBottom: '8px', padding: '14px',
          background: 'var(--tg-theme-button-color, #2196f3)',
          color: 'var(--tg-theme-button-text-color, #fff)',
          border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: '600',
          cursor: submitting ? 'not-allowed' : 'pointer',
          opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? 'Saving...' : (isEdit ? 'Update Expense' : 'Save Expense')}
      </button>
    </div>
  )
}
