import { useEffect, useState } from 'react'
import type { AppContext } from '../App'
import type { BalancesResponse, SimplifiedTransaction } from '../types'
import { balancesApi, settlementsApi } from '../api'

const COMMON_CURRENCIES = ['SGD', 'USD', 'EUR', 'GBP', 'JPY', 'MYR', 'AUD', 'HKD']

interface SettleModalState {
  transaction: SimplifiedTransaction
}

export function BalancesPage({ ctx }: { ctx: AppContext }) {
  const [balances, setBalances] = useState<BalancesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<SettleModalState | null>(null)
  const [settleAmount, setSettleAmount] = useState('')
  const [settleCurrency, setSettleCurrency] = useState('')
  const [settleCustomCurrency, setSettleCustomCurrency] = useState('')
  const [settleNote, setSettleNote] = useState('')
  const [settling, setSettling] = useState(false)
  const [settleError, setSettleError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await balancesApi.get(ctx.chatId)
      setBalances(res)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [ctx.chatId])

  const openSettle = (tx: SimplifiedTransaction) => {
    setModal({ transaction: tx })
    setSettleAmount(String(tx.amount))
    const curr = tx.currency
    if (COMMON_CURRENCIES.includes(curr)) {
      setSettleCurrency(curr)
      setSettleCustomCurrency('')
    } else {
      setSettleCurrency('custom')
      setSettleCustomCurrency(curr)
    }
    setSettleNote('')
    setSettleError(null)
  }

  const handleSettle = async () => {
    if (!modal) return
    const amount = parseFloat(settleAmount)
    if (isNaN(amount) || amount <= 0) { setSettleError('Enter a valid amount'); return }
    const activeCurrency = settleCurrency === 'custom' ? settleCustomCurrency : settleCurrency
    if (!activeCurrency.trim()) { setSettleError('Enter a currency'); return }

    setSettling(true)
    try {
      await settlementsApi.create(ctx.chatId, {
        from_member_id: modal.transaction.from_member_id,
        to_member_id: modal.transaction.to_member_id,
        amount,
        currency: activeCurrency.toUpperCase().trim(),
        note: settleNote.trim() || null,
      })
      setModal(null)
      load()
    } catch (e) {
      setSettleError(String(e))
    } finally {
      setSettling(false)
    }
  }

  const memberName = (id: number) => {
    const m = ctx.members.find(m => m.id === id)
    if (!m) return 'Unknown'
    const name = m.last_name ? `${m.first_name} ${m.last_name}` : m.first_name
    return m.id === ctx.currentMember.id ? `${name} (You)` : name
  }

  if (loading) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--tg-theme-hint-color)' }}>
        Loading...
      </div>
    )
  }

  const currencies = Object.keys(balances?.by_currency || {})
  const allTransactions = currencies.flatMap(c =>
    (balances?.by_currency[c]?.simplified_transactions || [])
  )

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

  return (
    <div style={{ padding: '12px' }}>
      <h2 style={{ marginBottom: '4px', fontSize: '18px' }}>Balances</h2>
      <p style={{ fontSize: '13px', color: 'var(--tg-theme-hint-color)', marginBottom: '16px' }}>
        Simplified — fewest payments to settle up
      </p>

      {allTransactions.length === 0 ? (
        <div style={{ textAlign: 'center', color: 'var(--tg-theme-hint-color)', marginTop: '3rem' }}>
          <div style={{ fontSize: '40px', marginBottom: '12px' }}>🎉</div>
          <p style={{ fontWeight: '600' }}>All settled up!</p>
          <p style={{ fontSize: '14px', marginTop: '8px' }}>No outstanding debts.</p>
        </div>
      ) : (
        currencies.map(currency => {
          const { simplified_transactions } = balances!.by_currency[currency]
          if (simplified_transactions.length === 0) return null
          return (
            <div key={currency} style={{ marginBottom: '20px' }}>
              <div style={{
                fontSize: '12px', fontWeight: '700',
                color: 'var(--tg-theme-hint-color)',
                textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '8px',
              }}>
                {currency}
              </div>
              {simplified_transactions.map((tx, i) => (
                <div key={i} style={{
                  background: 'var(--tg-theme-secondary-bg-color, #f5f5f5)',
                  borderRadius: '12px', padding: '14px', marginBottom: '8px',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>
                      {memberName(tx.from_member_id)}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--tg-theme-hint-color)', margin: '2px 0' }}>
                      owes
                    </div>
                    <div style={{ fontWeight: '600', fontSize: '14px' }}>
                      {memberName(tx.to_member_id)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: '700', fontSize: '18px', marginBottom: '8px' }}>
                      {tx.currency} {tx.amount.toFixed(2)}
                    </div>
                    <button
                      onClick={() => openSettle(tx)}
                      style={{
                        padding: '8px 16px', borderRadius: '20px',
                        background: 'var(--tg-theme-button-color, #2196f3)',
                        color: 'var(--tg-theme-button-text-color, #fff)',
                        border: 'none', cursor: 'pointer', fontSize: '13px', fontWeight: '600',
                      }}
                    >
                      Settle ✓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )
        })
      )}

      {modal && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'flex-end', zIndex: 200,
          }}
          onClick={e => { if (e.target === e.currentTarget) setModal(null) }}
        >
          <div style={{
            background: 'var(--tg-theme-bg-color, #fff)',
            borderRadius: '20px 20px 0 0', padding: '20px', width: '100%',
            maxHeight: '90vh', overflowY: 'auto',
          }}>
            <h3 style={{ fontSize: '18px', marginBottom: '8px' }}>Settle Up</h3>
            <p style={{ fontSize: '13px', color: 'var(--tg-theme-hint-color)', marginBottom: '2px' }}>
              From: <strong>{memberName(modal.transaction.from_member_id)}</strong>
            </p>
            <p style={{ fontSize: '13px', color: 'var(--tg-theme-hint-color)' }}>
              To: <strong>{memberName(modal.transaction.to_member_id)}</strong>
            </p>

            {settleError && (
              <div style={{
                background: '#ffebee', color: '#c62828', padding: '10px 12px',
                borderRadius: '8px', marginTop: '12px', fontSize: '14px',
              }}>
                {settleError}
              </div>
            )}

            <label style={labelStyle}>Amount & Currency</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                style={{ ...inputStyle, flex: 1 }}
                type="number" min="0" step="0.01" placeholder="0.00"
                value={settleAmount}
                onChange={e => setSettleAmount(e.target.value)}
              />
              <select
                style={{ ...inputStyle, width: 'auto', minWidth: '80px', flex: '0 0 auto' }}
                value={settleCurrency}
                onChange={e => setSettleCurrency(e.target.value)}
              >
                {COMMON_CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                <option value="custom">Other</option>
              </select>
            </div>
            {settleCurrency === 'custom' && (
              <input
                style={{ ...inputStyle, marginTop: '8px' }}
                placeholder="Currency code, e.g. THB"
                value={settleCustomCurrency}
                onChange={e => setSettleCustomCurrency(e.target.value.toUpperCase())}
              />
            )}

            <label style={labelStyle}>Note (optional)</label>
            <input
              style={inputStyle}
              placeholder="e.g. Paid via PayNow"
              value={settleNote}
              onChange={e => setSettleNote(e.target.value)}
            />

            <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setModal(null)}
                style={{
                  flex: 1, padding: '13px', borderRadius: '12px',
                  background: 'var(--tg-theme-secondary-bg-color, #f5f5f5)',
                  color: 'var(--tg-theme-text-color, #000)',
                  border: 'none', cursor: 'pointer', fontSize: '15px', fontWeight: '500',
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSettle}
                disabled={settling}
                style={{
                  flex: 2, padding: '13px', borderRadius: '12px',
                  background: 'var(--tg-theme-button-color, #2196f3)',
                  color: 'var(--tg-theme-button-text-color, #fff)',
                  border: 'none',
                  cursor: settling ? 'not-allowed' : 'pointer',
                  fontSize: '15px', fontWeight: '600',
                  opacity: settling ? 0.7 : 1,
                }}
              >
                {settling ? 'Confirming...' : 'Confirm Settlement'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
