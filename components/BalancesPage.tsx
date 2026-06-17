'use client'

import { useEffect, useState } from 'react'
import type { AppContext, BalancesResponse } from '@/types'

function memberName(members: AppContext['members'], id: number) {
  const m = members.find(x => x.id === id)
  if (!m) return `#${id}`
  return m.last_name ? `${m.first_name} ${m.last_name}` : m.first_name
}

export function BalancesPage({ ctx }: { ctx: AppContext }) {
  const { chatId, members } = ctx
  const [data, setData] = useState<BalancesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/groups/${chatId}/balances`, {
          headers: { 'X-Telegram-Init-Data': window.Telegram?.WebApp?.initData ?? '' },
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        setData(await res.json())
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [chatId])

  return (
    <div style={{ padding: '1rem' }}>
      <h1 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '1rem' }}>Balances</h1>

      {loading && <p style={{ color: 'var(--tg-theme-hint-color, #999)', textAlign: 'center' }}>Loading…</p>}
      {error && <p style={{ color: '#e53e3e', textAlign: 'center' }}>{error}</p>}

      {data && Object.keys(data.by_currency).length === 0 && (
        <p style={{ color: 'var(--tg-theme-hint-color, #999)', textAlign: 'center', marginTop: '2rem' }}>
          All settled up!
        </p>
      )}

      {data && Object.entries(data.by_currency).map(([currency, info]) => (
        <div key={currency} style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: 'var(--tg-theme-hint-color, #666)' }}>
            {currency}
          </h2>

          {info.net.length > 0 && (
            <div style={{ marginBottom: '1rem' }}>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--tg-theme-hint-color, #999)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Net Balances
              </p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {info.net.map(n => {
                  const positive = n.net_amount > 0
                  return (
                    <li
                      key={n.member_id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        padding: '0.5rem 0.75rem',
                        borderRadius: '8px',
                        background: 'var(--tg-theme-secondary-bg-color, #f5f5f5)',
                      }}
                    >
                      <span>{n.first_name}</span>
                      <span style={{ fontWeight: 600, color: positive ? '#38a169' : '#e53e3e' }}>
                        {positive ? '+' : ''}{n.net_amount.toFixed(2)}
                      </span>
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {info.simplified_transactions.length > 0 && (
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--tg-theme-hint-color, #999)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Suggested Payments
              </p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {info.simplified_transactions.map((t, i) => (
                  <li
                    key={i}
                    style={{
                      padding: '0.6rem 0.75rem',
                      borderRadius: '8px',
                      background: 'var(--tg-theme-secondary-bg-color, #f5f5f5)',
                      fontSize: '0.9rem',
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>
                      {memberName(members, t.from_member_id)}
                    </span>
                    {' pays '}
                    <span style={{ fontWeight: 600 }}>
                      {memberName(members, t.to_member_id)}
                    </span>
                    {' '}
                    <span style={{ color: '#e53e3e', fontWeight: 700 }}>
                      {currency} {t.amount.toFixed(2)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}
