'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAppContext } from '@/components/AppProvider'
import { CurrencyPicker, CURRENCIES } from '@/components/CurrencyPicker'
import { useShowSkeleton } from '@/lib/use-show-skeleton'
import { computeShareSplits } from '@/lib/splits'
import { CATEGORIES } from '@/lib/categories'
import { resizeImage } from '@/lib/image-resize'
import type { Expense } from '@/types'

interface Props {
  editId?: string
}

export function ExpenseFormPage({ editId }: Props) {
  const router = useRouter()
  const { chatId, group, members, currentMember, apiHeaders } = useAppContext()
  const isEdit = !!editId

  const [description, setDescription] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [paidBy, setPaidBy] = useState<number>(currentMember.id)
  const [splitType, setSplitType] = useState<'equal' | 'custom' | 'shares'>('equal')
  const [selectedMembers, setSelectedMembers] = useState<number[]>(members.map(m => m.id))
  const [customAmounts, setCustomAmounts] = useState<Record<number, string>>({})
  const [shareAmounts, setShareAmounts] = useState<Record<number, number>>(
    () => Object.fromEntries(members.map(m => [m.id, 1]))
  )
  const [category, setCategory] = useState<string>('')
  const [expenseCurrency, setExpenseCurrency] = useState<string>(group.currency)
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(isEdit)
  const [error, setError] = useState<string | null>(null)
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)

  // Receipt (optional, max one image per expense)
  const [receiptBlob, setReceiptBlob] = useState<Blob | null>(null)       // newly picked image
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null)
  const [existingReceiptUrl, setExistingReceiptUrl] = useState<string | null>(null) // edit mode
  const [hadReceipt, setHadReceipt] = useState(false)
  const [removeReceipt, setRemoveReceipt] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [receiptNote, setReceiptNote] = useState<string | null>(null)
  const [receiptError, setReceiptError] = useState<string | null>(null)
  const [scanFailed, setScanFailed] = useState(false)
  const [scanDone, setScanDone] = useState(false)
  const showSkeleton = useShowSkeleton(loading)

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
        // 'shares' was stored as 'custom'; load it as custom amounts
        setSplitType(exp.split_type === 'shares' ? 'custom' : exp.split_type)
        setCategory(exp.category ?? '')
        setExpenseCurrency(exp.currency ?? 'SGD')
        setHadReceipt(!!exp.has_receipt)
        setExistingReceiptUrl(exp.receipt_url ?? null)
        const ids = (exp.splits ?? []).map(s => s.member_id)
        setSelectedMembers(ids.length ? ids : members.map(m => m.id))
        if (exp.split_type === 'custom' || exp.split_type === 'shares') {
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

  // Free the object URL when the preview changes or the form unmounts
  useEffect(() => {
    return () => { if (receiptPreview) URL.revokeObjectURL(receiptPreview) }
  }, [receiptPreview])

  const handleReceiptPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow picking the same file again
    if (!file) return
    setReceiptError(null)
    setReceiptNote(null)
    try {
      const resized = await resizeImage(file)
      setReceiptBlob(resized)
      setReceiptPreview(URL.createObjectURL(resized))
      setRemoveReceipt(false)
      setScanFailed(false)
      setScanDone(false)
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : 'Could not read this image')
    }
  }

  const handleReceiptRemove = () => {
    setReceiptBlob(null)
    setReceiptPreview(null)
    setReceiptNote(null)
    setReceiptError(null)
    setScanFailed(false)
    setScanDone(false)
    if (hadReceipt) setRemoveReceipt(true)
  }

  // Optional: read the photo and pre-fill the form. Everything stays editable.
  const handleAutoFill = async () => {
    if (!receiptBlob) return
    setScanning(true)
    setScanFailed(false)
    setScanDone(false)
    setReceiptError(null)
    setReceiptNote(null)
    try {
      const res = await fetch(`/api/groups/${chatId}/receipts/parse`, {
        method: 'POST',
        headers: { ...apiHeaders, 'Content-Type': receiptBlob.type || 'image/jpeg' },
        body: receiptBlob,
      })
      const data = await res.json().catch(() => ({})) as {
        error?: string
        merchant?: string | null; total?: number | null; currency?: string | null
        date?: string | null; category?: string | null
      }
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`)

      const filled: string[] = []
      if (data.merchant) { setDescription(data.merchant); filled.push('shop') }
      if (data.total) { setAmount(String(data.total)); filled.push('amount') }
      if (data.currency && CURRENCIES.some(c => c.code === data.currency)) {
        setExpenseCurrency(data.currency); filled.push('currency')
      }
      if (data.date) { setDate(data.date); filled.push('date') }
      if (data.category) { setCategory(data.category); filled.push('category') }
      setReceiptNote(filled.length ? `Filled ${filled.join(', ')} from the receipt. Please check before saving.` : null)
      if (data.currency && !CURRENCIES.some(c => c.code === data.currency)) {
        setReceiptNote(n => `${n ?? ''} Receipt currency ${data.currency} isn't in the list, so the currency was left as is.`.trim())
      }
      setScanDone(filled.length > 0)
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')
    } catch (err) {
      setReceiptError(err instanceof Error ? err.message : 'Receipt scanning failed')
      setScanFailed(true)
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error')
    } finally {
      setScanning(false)
    }
  }

  // Runs after the expense is saved. Returns true if the receipt step failed.
  const syncReceipt = async (expenseId: number): Promise<boolean> => {
    try {
      if (receiptBlob) {
        const res = await fetch(`/api/groups/${chatId}/expenses/${expenseId}/receipt`, {
          method: 'PUT',
          headers: { ...apiHeaders, 'Content-Type': receiptBlob.type || 'image/jpeg' },
          body: receiptBlob,
        })
        return !res.ok
      }
      if (removeReceipt && hadReceipt) {
        const res = await fetch(`/api/groups/${chatId}/expenses/${expenseId}/receipt`, {
          method: 'DELETE',
          headers: apiHeaders,
        })
        return !res.ok
      }
      return false
    } catch {
      return true
    }
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

    if (splitType === 'shares') {
      const invalid = selectedMembers.some(id => (shareAmounts[id] ?? 1) < 1)
      if (invalid) { setError('Each person must have at least 1 share.'); return }
    }

    let splits: Array<{ member_id: number; amount?: number }>
    let submitSplitType: 'equal' | 'custom'

    if (splitType === 'equal') {
      splits = selectedMembers.map(id => ({ member_id: id }))
      submitSplitType = 'equal'
    } else if (splitType === 'shares') {
      const computed = computeShareSplits(totalAmt, selectedMembers.map(id => ({ member_id: id, shares: shareAmounts[id] ?? 1 })))
      splits = computed
      submitSplitType = 'custom'
    } else {
      splits = selectedMembers.map(id => ({ member_id: id, amount: parseFloat(customAmounts[id] ?? '0') || 0 }))
      submitSplitType = 'custom'
    }

    const body = {
      description,
      total_amount: totalAmt,
      currency: expenseCurrency,
      paid_by_member_id: paidBy,
      split_type: submitSplitType,
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
      const saved = await res.json().catch(() => null) as { id?: number } | null
      const expenseId = isEdit ? Number(editId) : saved?.id
      const receiptFailed = expenseId ? await syncReceipt(expenseId) : !!receiptBlob
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred(receiptFailed ? 'warning' : 'success')
      if (receiptFailed) {
        // The expense is already saved, so don't stay on the form (a resubmit would duplicate it)
        const msg = 'Expense saved, but the receipt could not be uploaded. Open the expense and edit it to try again.'
        const tg = window.Telegram?.WebApp
        if (tg?.showAlert) tg.showAlert(msg, () => navigate('/'))
        else { window.alert(msg); navigate('/') }
        return
      }
      navigate('/')
    } catch (e) {
      setError(String(e))
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('error')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && !showSkeleton) {
    return <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-8 page-enter" />
  }

  if (loading) {
    return (
      <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-8 page-enter">
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => navigate('/')}
            className="text-sm font-medium"
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--tg-theme-link-color)' }}
          >
            ← Back
          </button>
          <h1 className="text-lg font-bold">Edit Expense</h1>
        </div>
        <div className="flex flex-col gap-5">
          {['Description', 'Amount', 'Paid by', 'Split between', 'Date'].map(label => (
            <div key={label}>
              <div className="skeleton" style={{ height: 11, width: label.length * 7.5, borderRadius: 3, margin: '0 16px 6px' }} />
              <div className="tg-section">
                <div className="skeleton" style={{ height: 44, borderRadius: 0 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-8 page-enter">
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
        {/* Receipt (optional) */}
        <div>
          <p className="tg-label">Receipt (optional)</p>
          {(() => {
            const shownUrl = receiptPreview ?? (removeReceipt ? null : existingReceiptUrl)
            const hasSavedReceipt = !receiptPreview && !removeReceipt && hadReceipt
            if (!shownUrl && !hasSavedReceipt) {
              return (
                <label
                  className="flex items-center justify-center gap-2 text-sm font-semibold"
                  style={{
                    border: '1.5px dashed var(--tg-theme-hint-color)', borderRadius: 12, padding: '16px 12px',
                    cursor: 'pointer', color: 'var(--tg-theme-link-color)',
                  }}
                >
                  <span>📷</span> Add receipt photo
                  <input type="file" accept="image/*" onChange={handleReceiptPicked} style={{ display: 'none' }} />
                </label>
              )
            }
            const status = scanDone
              ? '✓ Filled from receipt'
              : receiptBlob ? `${Math.max(1, Math.round(receiptBlob.size / 1024))} KB · saved with the expense` : 'Saved with this expense'
            return (
              <>
                <div className="tg-section flex items-center gap-3" style={{ padding: '10px 12px' }}>
                  {shownUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={shownUrl} alt="Receipt" style={{ width: 44, height: 58, objectFit: 'cover', borderRadius: 7, flexShrink: 0, border: '1px solid rgba(0,0,0,0.07)' }} />
                  ) : (
                    <div style={{ width: 44, height: 58, borderRadius: 7, background: 'var(--tg-theme-secondary-bg-color)', flexShrink: 0 }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">Receipt photo</p>
                    <p className="text-xs mt-0.5" style={{ color: scanDone ? '#1c9c48' : 'var(--tg-theme-hint-color)' }}>{status}</p>
                  </div>
                  <button
                    type="button"
                    onClick={handleReceiptRemove}
                    aria-label="Remove receipt"
                    className="flex items-center justify-center flex-shrink-0"
                    style={{ width: 34, height: 34, borderRadius: 10, border: 'none', cursor: 'pointer', background: 'rgba(255,59,48,0.1)', color: '#ff3b30' }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                    </svg>
                  </button>
                </div>
                {receiptBlob && (
                  <button
                    type="button"
                    onClick={handleAutoFill}
                    disabled={scanning}
                    className="tg-btn mt-2"
                    style={{ opacity: scanning ? 0.65 : 1, cursor: scanning ? 'default' : 'pointer' }}
                  >
                    {scanning ? 'Reading receipt…' : scanFailed ? '↻ Try auto-fill again' : scanDone ? '↻ Auto-fill again' : '✨ Auto-fill from receipt'}
                  </button>
                )}
              </>
            )
          })()}
          {receiptBlob && !receiptNote && !scanning && !receiptError && (
            <p className="text-xs mt-2 px-1" style={{ color: 'var(--tg-theme-hint-color)' }}>
              Auto-fill sends this photo to Google Gemini to read it. The photo is only stored if you save the expense.
            </p>
          )}
          {receiptNote && (
            <p className="text-xs mt-2 px-1" style={{ color: 'var(--tg-theme-hint-color)' }}>{receiptNote}</p>
          )}
          {receiptError && (
            <p className="text-xs mt-2 px-1" style={{ color: 'var(--tg-theme-destructive-text-color, #ff3b30)' }}>{receiptError}</p>
          )}
        </div>

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
            {([
              ['equal', '⚖️ Equal'],
              ['custom', '✏️ Custom'],
              ['shares', '🔢 Shares'],
            ] as const).map(([type, label]) => (
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
                {label}
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

                  {/* Shares: stepper */}
                  {splitType === 'shares' && checked && (() => {
                    const s = shareAmounts[m.id] ?? 1
                    const totalShares = selectedMembers.reduce((sum, id) => sum + (shareAmounts[id] ?? 1), 0)
                    const computed = totalShares > 0 && totalAmt > 0
                      ? (totalAmt * s / totalShares).toFixed(2)
                      : null
                    return (
                      <div className="flex flex-col items-end gap-0.5" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setShareAmounts(prev => ({ ...prev, [m.id]: Math.max(1, (prev[m.id] ?? 1) - 1) }))}
                            style={{
                              width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer',
                              background: 'var(--tg-theme-secondary-bg-color)',
                              color: 'var(--tg-theme-text-color)',
                              fontSize: '16px', fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >−</button>
                          <span style={{ width: 24, textAlign: 'center', fontSize: '15px', fontWeight: 600 }}>{s}</span>
                          <button
                            type="button"
                            onClick={() => setShareAmounts(prev => ({ ...prev, [m.id]: (prev[m.id] ?? 1) + 1 }))}
                            style={{
                              width: 28, height: 28, borderRadius: '50%', border: 'none', cursor: 'pointer',
                              background: 'var(--tg-theme-secondary-bg-color)',
                              color: 'var(--tg-theme-text-color)',
                              fontSize: '16px', fontWeight: 700,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}
                          >+</button>
                        </div>
                        {computed && (
                          <span style={{ fontSize: '11px', color: 'var(--tg-theme-hint-color)' }}>
                            {expenseCurrency} {computed}
                          </span>
                        )}
                      </div>
                    )
                  })()}
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

          {/* Shares summary */}
          {splitType === 'shares' && (
            <div className="mt-2 px-1">
              <p className="text-xs" style={{ color: 'var(--tg-theme-hint-color)' }}>
                {selectedMembers.reduce((sum, id) => sum + (shareAmounts[id] ?? 1), 0)} total shares
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
