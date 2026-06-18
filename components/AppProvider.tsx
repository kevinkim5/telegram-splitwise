'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Group, Member } from '@/types'
import { NavBar } from '@/components/NavBar'

interface AppContextValue {
  chatId: string
  initData: string
  group: Group
  currentMember: Member
  members: Member[]
  refreshMembers: () => Promise<void>
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

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
    }

    const searchParams = new URLSearchParams(window.location.search)
    const chatId = searchParams.get('chatId')
    const chatTitle = decodeURIComponent(searchParams.get('chatTitle') ?? 'Group')
    const initData = tg?.initData ?? ''

    if (!chatId) {
      setError('Open this app from a Telegram group chat by sending /start to the bot.')
      return
    }

    const apiHeaders = {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData,
    }

    const init = async () => {
      try {
        const res = await fetch('/api/groups/init', {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify({ chatId, chatTitle }),
        })
        if (!res.ok) {
          const err = await res.json()
          throw new Error(err.error ?? 'Failed to initialize group')
        }
        const { group, member } = await res.json() as { group: Group; member: Member }

        const membersRes = await fetch(`/api/groups/${chatId}/members`, { headers: apiHeaders })
        const members: Member[] = await membersRes.json()

        const refreshMembers = async () => {
          const r = await fetch(`/api/groups/${chatId}/members`, { headers: apiHeaders })
          const m: Member[] = await r.json()
          setCtx(prev => prev ? { ...prev, members: m } : prev)
        }

        setCtx({ chatId, initData, group, currentMember: member, members, refreshMembers, apiHeaders })
      } catch (e) {
        setError(String(e))
      }
    }

    init()
  }, [])

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen p-8 text-center gap-4">
        <div className="text-4xl">💰</div>
        <h1 className="text-lg font-semibold">Splitwise</h1>
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
      <div className="flex flex-col min-h-screen">
        <div className="flex-1 overflow-y-auto" style={{ paddingBottom: '64px' }}>
          {children}
        </div>
        <NavBar />
      </div>
    </AppCtx.Provider>
  )
}
