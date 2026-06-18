'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { Group, Member } from '@/types'
import { CurrencyPicker } from '@/components/CurrencyPicker'

interface AppContextValue {
  chatId: string
  initData: string
  group: Group
  currentMember: Member
  members: Member[]
  refreshMembers: () => Promise<void>
  refreshGroup: () => Promise<void>
  apiHeaders: Record<string, string>
}

const AppCtx = createContext<AppContextValue | null>(null)

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<AppContextValue | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false)
  const [pendingCurrency, setPendingCurrency] = useState<string | null>(null)

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
    }

    const searchParams = new URLSearchParams(window.location.search)
    // chatId sources: URL param (private inline btn) → startapp param (t.me group link) → initData.chat (menu btn)
    const chatId = searchParams.get('chatId')
      ?? tg?.initDataUnsafe?.start_param
      ?? tg?.initDataUnsafe?.chat?.id?.toString()
      ?? null
    const chatTitle = decodeURIComponent(
      searchParams.get('chatTitle') ?? tg?.initDataUnsafe?.chat?.title ?? 'Group'
    )
    const initData = tg?.initData ?? ''

    if (!chatId) {
      setError('Open this app from a Telegram group chat by sending /start to the bot.')
      return
    }

    const apiHeaders = {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
    }

    const photo_url = tg?.initDataUnsafe?.user?.photo_url ?? null

    const init = async (currency?: string) => {
      try {
        const res = await fetch('/api/groups/init', {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify({ chatId, chatTitle, currency, photo_url }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? 'Failed to initialize group')
        }
        const { group, member, is_new_group } = await res.json() as {
          group: Group
          member: Member
          is_new_group: boolean
        }

        const membersRes = await fetch(`/api/groups/${chatId}/members`, { headers: apiHeaders })
        const members: Member[] = await membersRes.json()

        const refreshMembers = async () => {
          const r = await fetch(`/api/groups/${chatId}/members`, { headers: apiHeaders })
          const m: Member[] = await r.json()
          setCtx(prev => prev ? { ...prev, members: m } : prev)
        }

        const refreshGroup = async () => {
          const r = await fetch(`/api/groups/${chatId}/settings`, { headers: apiHeaders })
          const g: { currency: string; title: string } = await r.json()
          setCtx(prev => prev ? { ...prev, group: { ...prev.group, ...g } } : prev)
        }

        setCtx({ chatId, initData, group, currentMember: member, members, refreshMembers, refreshGroup, apiHeaders })

        // Show currency picker for brand-new groups
        if (is_new_group) {
          setShowCurrencyPicker(true)
        }
      } catch (e) {
        setError(String(e))
      }
    }

    init()
  }, [])

  const handleCurrencySelect = async (currency: string) => {
    if (!ctx) return
    try {
      await fetch(`/api/groups/${ctx.chatId}/settings`, {
        method: 'PUT',
        headers: ctx.apiHeaders,
        body: JSON.stringify({ currency }),
      })
      setCtx(prev => prev ? { ...prev, group: { ...prev.group, currency } } : prev)
      window.Telegram?.WebApp?.HapticFeedback?.notificationOccurred('success')
    } catch {
      // silently ignore — user can change later
    }
    setShowCurrencyPicker(false)
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center gap-4">
        <div className="text-4xl">💰</div>
        <h1 className="text-lg font-semibold">Split</h1>
        <p style={{ color: 'var(--tg-theme-hint-color)' }} className="text-sm">{error}</p>
      </div>
    )
  }

  if (!ctx) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <div className="text-3xl">💰</div>
        <p style={{ color: 'var(--tg-theme-hint-color)' }} className="text-sm">Loading...</p>
      </div>
    )
  }

  return (
    <AppCtx.Provider value={ctx}>
      <div className="flex flex-col h-full">
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>

      {showCurrencyPicker && (
        <CurrencyPicker
          current={ctx.group.currency}
          onSelect={handleCurrencySelect}
          onClose={() => setShowCurrencyPicker(false)}
          isFirstTime
        />
      )}
    </AppCtx.Provider>
  )
}
