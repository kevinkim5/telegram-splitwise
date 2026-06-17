'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { AppContext, Member } from '@/types'
import { NavBar } from '@/components/NavBar'

const AppCtx = createContext<AppContext | null>(null)

export function useAppContext(): AppContext {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useAppContext must be used within AppProvider')
  return ctx
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [ctx, setCtx] = useState<AppContext | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    tg?.ready()
    tg?.expand()

    const chatId = new URLSearchParams(window.location.search).get('chat_id')
    if (!chatId) { setError('Open this app from a Telegram group chat.'); return }

    const chatTitle = tg?.initDataUnsafe?.chat?.title
    const initData = tg?.initData ?? ''
    const headers = { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': initData }

    const init = async () => {
      try {
        const joinRes = await fetch('/api/groups/join', {
          method: 'POST', headers,
          body: JSON.stringify({ chat_id: chatId, title: chatTitle }),
        })
        const { member } = await joinRes.json()
        const members: Member[] = await fetch(`/api/groups/${chatId}/members`, { headers }).then(r => r.json())

        const refreshMembers = async () => {
          const m: Member[] = await fetch(`/api/groups/${chatId}/members`, { headers }).then(r => r.json())
          setCtx(prev => prev ? { ...prev, members: m } : prev)
        }

        setCtx({ chatId, currentMember: member, members, refreshMembers })
      } catch (e) {
        setError(String(e))
      }
    }
    init()
  }, [])

  if (error) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--tg-theme-hint-color, #999)' }}>{error}</div>
  )
  if (!ctx) return (
    <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--tg-theme-hint-color, #999)' }}>Loading...</div>
  )

  return (
    <AppCtx.Provider value={ctx}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '60px' }}>{children}</div>
        <NavBar />
      </div>
    </AppCtx.Provider>
  )
}
