'use client'

import { useState } from 'react'
import { CONVERT_TO } from '@/lib/convert'
import { useRates } from '@/lib/use-rates'
import { summarizeTotals, type CurrencyTotal } from '@/lib/group-totals'

const grey = '#9ca3af'
const money = (n: number) => n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Top line of a group: everything spent in SGD (ECB rates, same as everywhere else), with a tap-to-open
// breakdown by currency. While rates load, or if they can't be used, the amounts show in their own
// currencies, as the page always did, rather than a partial or missing total.
export function GroupTotals({ totals }: { totals: CurrencyTotal[] }) {
  const [open, setOpen] = useState(false)
  const { rates, failed } = useRates(totals.map(t => t.currency))
  const s = summarizeTotals(totals, rates)

  if (totals.length === 0) return <div style={{ marginBottom: '1.5rem' }} />

  const originals = (
    <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
      {s.rows.map((r, i) => (
        <span key={r.currency}>
          {i > 0 && <span style={{ color: '#d1d5db', margin: '0 0.375rem' }}>·</span>}
          {r.currency} {r.total.toFixed(2)}
        </span>
      ))}
    </span>
  )

  if (s.mode === 'plain') {
    return <p style={{ marginBottom: '1.5rem' }}><span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{CONVERT_TO} {money(s.total ?? 0)}</span></p>
  }

  if (s.mode === 'original') {
    return (
      <div style={{ marginBottom: '1.5rem' }}>
        <p>{originals}</p>
        {(rates || failed) && (
          <p style={{ fontSize: '0.6875rem', color: grey, marginTop: '0.125rem' }}>
            {rates ? `No rate for ${s.missing.join(', ')}, so no combined ${CONVERT_TO} total` : `Couldn't load exchange rates for a ${CONVERT_TO} total`}
          </p>
        )}
      </div>
    )
  }

  return (
    <div style={{ marginBottom: '1.5rem' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
        aria-controls="group-totals-breakdown"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'inherit' }}
      >
        <span style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>≈ {CONVERT_TO} {money(s.total ?? 0)}</span>
        <span style={{ fontSize: '0.6875rem', color: grey }}>{s.rows.length} {s.rows.length === 1 ? 'currency' : 'currencies'} {open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div id="group-totals-breakdown" style={{ marginTop: '0.5rem', background: '#fff', borderRadius: '10px', padding: '0.25rem 0.875rem', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', maxWidth: 360 }}>
          {s.rows.map((r, i) => (
            <div key={r.currency} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '0.4375rem 0', fontSize: '0.8125rem', borderTop: i ? '0.5px solid #f3f4f6' : 'none' }}>
              <span style={{ fontWeight: 600, color: '#111827' }}>{r.currency} {money(r.total)}</span>
              <span style={{ color: grey }}>{r.currency === CONVERT_TO ? '' : `≈ ${CONVERT_TO} ${money(r.converted ?? 0)}`}</span>
            </div>
          ))}
          <div style={{ fontSize: '0.6875rem', color: grey, padding: '0.375rem 0 0.5rem', borderTop: '0.5px solid #f3f4f6' }}>ECB rates, same as the app</div>
        </div>
      )}
    </div>
  )
}
