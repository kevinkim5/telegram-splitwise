import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useTelegram } from './hooks/useTelegram'
import { groupsApi } from './api'
import type { Member } from './types'
import { ExpensesPage } from './pages/ExpensesPage'
import { ExpenseFormPage } from './pages/ExpenseFormPage'
import { BalancesPage } from './pages/BalancesPage'
import { NavBar } from './components/NavBar'

export interface AppContext {
  chatId: string
  currentMember: Member
  members: Member[]
  refreshMembers: () => Promise<void>
}

export function App() {
  const { tg, user, chatId, chatTitle } = useTelegram()
  const [ctx, setCtx] = useState<AppContext | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    tg?.ready()
    tg?.expand()
  }, [tg])

  useEffect(() => {
    if (!chatId) {
      setError('This app must be opened from a group chat.')
      return
    }
    const init = async () => {
      try {
        const { member } = await groupsApi.join(chatId, chatTitle)
        const members = await groupsApi.members(chatId)
        setCtx({
          chatId,
          currentMember: member,
          members,
          refreshMembers: async () => {
            const m = await groupsApi.members(chatId)
            setCtx(prev => prev ? { ...prev, members: m } : prev)
          },
        })
      } catch (e) {
        setError(String(e))
      }
    }
    init()
  }, [chatId, chatTitle])

  if (error) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--tg-theme-hint-color)' }}>
        <p>{error}</p>
      </div>
    )
  }

  if (!ctx) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--tg-theme-hint-color)' }}>
        Loading...
      </div>
    )
  }

  return (
    <BrowserRouter>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
        <div style={{ flex: 1, overflowY: 'auto', paddingBottom: '60px' }}>
          <Routes>
            <Route path="/" element={<ExpensesPage ctx={ctx} />} />
            <Route path="/add" element={<ExpenseFormPage ctx={ctx} />} />
            <Route path="/edit/:id" element={<ExpenseFormPage ctx={ctx} />} />
            <Route path="/balances" element={<BalancesPage ctx={ctx} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
        <NavBar />
      </div>
    </BrowserRouter>
  )
}
