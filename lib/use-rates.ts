'use client'

import { useEffect, useState } from 'react'
import { CONVERT_TO } from '@/lib/convert'

// Exchange rates into CONVERT_TO for the given currencies, from /api/rates (ECB via Frankfurter),
// loaded as soon as there is a currency to convert. The same source every conversion in the app uses.
export function useRates(currencies: string[]) {
  const [rates, setRates] = useState<Record<string, number> | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const key = [...new Set(currencies.filter(c => c !== CONVERT_TO))].sort().join(',')

  useEffect(() => {
    if (!key) return
    let cancelled = false
    setFailed(false)
    fetch(`/api/rates?from=${key}&to=${CONVERT_TO}`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: { rates?: Record<string, number>; date?: string } | null) => {
        if (cancelled) return
        if (!j?.rates) { setFailed(true); return }
        setRates(j.rates)
        setDate(j.date ?? null)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [key, attempt])

  return { rates, date, failed, retry: () => setAttempt(n => n + 1) }
}
