'use client'

import { useState } from 'react'
import { CONVERT_TO, sumConverted } from '@/lib/convert'
import { useRates } from '@/lib/use-rates'

interface Line { currency: string; net: number } // positive = gets back, negative = owes
export interface AdminMember { id: number; name: string; lines: Line[] }
export interface AdminDebt { from_member_id: number; from_name: string; to_member_id: number; to_name: string; amount: number; currency: string }

const grey = '#9ca3af'
const green = '#16a34a'
const red = '#dc2626'

// The group's balances laid out like the app's Balances page: everything in SGD at ECB rates, one
// line per person ("gets back ≈ SGD x" / "owes ≈ SGD x"), expandable to who owes whom with the
// converted amount first and the original in brackets. Falls back to original currencies while
// rates load or if a currency has no rate.
export function AdminBalances({ members, debts }: { members: AdminMember[]; debts: AdminDebt[] }) {
  const [open, setOpen] = useState<Set<number>>(new Set())
  const currencies = [...new Set(members.flatMap(m => m.lines.map(l => l.currency)))]
  const { rates, date, failed, retry } = useRates(currencies)

  const unrated = rates ? currencies.filter(c => c !== CONVERT_TO && !rates[c]) : []
  const approx = (amount: number, currency: string) => {
    if (currency === CONVERT_TO || !rates?.[currency]) return null
    return `≈ ${CONVERT_TO} ${(Math.round(amount * rates[currency]! * 100) / 100).toFixed(2)}`
  }
  const toggle = (id: number) => setOpen(prev => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n })

  const outstanding = members.some(m => m.lines.length > 0)
  if (!outstanding) {
    return <div style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.875rem' }}>All settled up ✓</div>
  }

  return (
    <div>
      {currencies.some(c => c !== CONVERT_TO) && (rates || failed) && (
        <div style={{ padding: '0.5rem 1rem', fontSize: '0.75rem', color: grey, borderBottom: '0.5px solid #f3f4f6', display: 'flex', justifyContent: 'space-between', gap: '0.75rem' }}>
          {rates ? (
            <span>
              ECB rates{date ? ` · ${new Date(`${date}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              {unrated.length ? ` · no rate for ${unrated.join(', ')}` : ''}
            </span>
          ) : (
            <>
              <span style={{ color: red }}>Couldn&apos;t load exchange rates, so amounts are in their own currencies.</span>
              <button onClick={retry} style={{ background: 'none', border: 'none', color: '#2563eb', fontWeight: 600, cursor: 'pointer', fontSize: '0.75rem' }}>Retry</button>
            </>
          )}
        </div>
      )}

      {members.map((m, i) => {
        const memberDebts = debts.filter(d => d.from_member_id === m.id || d.to_member_id === m.id)
        const sum = m.lines.length > 0 ? sumConverted(m.lines, rates, CONVERT_TO) : null
        const total = sum && sum.usedAny && sum.missing.length === 0 ? sum.total : null
        const converted = m.lines.some(l => l.currency !== CONVERT_TO)
        const isOpen = open.has(m.id)
        const hasDetails = memberDebts.length > 0
        return (
          <div key={m.id} style={{ borderBottom: i === members.length - 1 ? 'none' : '0.5px solid #f3f4f6' }}>
            <button
              onClick={() => hasDetails && toggle(m.id)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.75rem 1rem', background: 'none', border: 'none', textAlign: 'left', cursor: hasDetails ? 'pointer' : 'default' }}
            >
              <span style={{ fontWeight: 500, fontSize: '0.875rem', color: '#111827' }}>{m.name}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', fontSize: '0.8125rem', fontWeight: 700 }}>
                  {m.lines.length === 0 ? (
                    <span style={{ color: grey, fontWeight: 400 }}>Settled</span>
                  ) : total !== null ? (
                    Math.abs(total) < 0.005
                      ? <span style={{ color: grey }}>evens out {CONVERT_TO} 0.00</span>
                      : <span style={{ color: total > 0 ? green : red }}>
                          {total > 0 ? 'gets back' : 'owes'} {converted ? '≈ ' : ''}{CONVERT_TO} {Math.abs(total).toFixed(2)}
                        </span>
                  ) : (
                    m.lines.map(l => (
                      <span key={l.currency} style={{ color: l.net > 0 ? green : red }}>
                        {l.net > 0 ? 'gets back' : 'owes'} {l.currency} {Math.abs(l.net).toFixed(2)}
                      </span>
                    ))
                  )}
                </span>
                {hasDetails && <span style={{ color: grey, fontSize: '0.625rem' }}>{isOpen ? '▲' : '▼'}</span>}
              </span>
            </button>

            {isOpen && (
              <div style={{ padding: '0 1rem 0.75rem', borderTop: '0.5px solid #f3f4f6', background: '#f9fafb' }}>
                {memberDebts.map((d, di) => {
                  const a = approx(d.amount, d.currency)
                  return (
                    <p key={di} style={{ fontSize: '0.75rem', color: grey, padding: '0.25rem 0' }}>
                      {d.from_name} owes {d.to_name}{' '}
                      <span style={{ color: '#111827', fontWeight: 600 }}>{a ?? `${d.currency} ${d.amount.toFixed(2)}`}</span>
                      {a && <span> ({d.currency} {d.amount.toFixed(2)})</span>}
                    </p>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
