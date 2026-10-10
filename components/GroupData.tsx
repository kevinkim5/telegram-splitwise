'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAppContext } from '@/components/AppProvider'
import type { NamedBalance } from '@/lib/balances'
import type { SimplifiedDebt } from '@/types'

export interface BalancesData {
  balances: NamedBalance[]
  balances_by_currency: Record<string, NamedBalance[]>
  simplified_debts: SimplifiedDebt[]
}

interface GroupDataValue {
  balances: BalancesData | null
  balancesError: string | null
  balancesLoading: boolean
  // maxAgeMs: skip the request if the data is newer than this (used when returning to a tab)
  refreshBalances: (maxAgeMs?: number) => Promise<void>
}

const Ctx = createContext<GroupDataValue | null>(null)

// Balances are needed by the header (the "You owe" line) and by the Balances tab, and every screen
// that changes them (delete an expense, record a payment) must refresh both. They live here once, so
// there is a single copy, one request, and nothing to keep in sync by hand.
export function GroupDataProvider({ children }: { children: React.ReactNode }) {
  const { chatId, apiHeaders } = useAppContext()
  const [balances, setBalances] = useState<BalancesData | null>(null)
  const [balancesError, setBalancesError] = useState<string | null>(null)
  const [balancesLoading, setBalancesLoading] = useState(true)
  const inflight = useRef<Promise<void> | null>(null)
  const lastAt = useRef(0)

  const refreshBalances = useCallback((maxAgeMs = 0): Promise<void> => {
    if (inflight.current) return inflight.current // don't stack requests
    if (maxAgeMs > 0 && Date.now() - lastAt.current < maxAgeMs) return Promise.resolve()
    const run = (async () => {
      try {
        const res = await fetch(`/api/groups/${chatId}/balances`, { headers: apiHeaders })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json() as BalancesData
        // a malformed answer must not blank the screen: treat it as an error
        if (!json || typeof json.balances_by_currency !== 'object' || !Array.isArray(json.simplified_debts)) throw new Error('Unexpected response')
        setBalances(json)
        setBalancesError(null)
        lastAt.current = Date.now()
      } catch (e) {
        setBalancesError(String(e))
      } finally {
        setBalancesLoading(false)
        inflight.current = null
      }
    })()
    inflight.current = run
    return run
  }, [chatId, apiHeaders])

  useEffect(() => { refreshBalances() }, [refreshBalances])

  const value = useMemo(
    () => ({ balances, balancesError, balancesLoading, refreshBalances }),
    [balances, balancesError, balancesLoading, refreshBalances],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useGroupData(): GroupDataValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useGroupData must be used inside the group screen')
  return v
}
