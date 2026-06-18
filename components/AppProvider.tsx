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

function ShimmerLine({ width }: { width: string }) {
  return (
    <div style={{
      height: 9, borderRadius: 4, width,
      background: 'linear-gradient(90deg, #d0d0d0 25%, #e8e8e8 50%, #d0d0d0 75%)',
      backgroundSize: '300px 100%',
      animation: 'shimmer 1.4s infinite linear',
    }} />
  )
}

function ReceiptLoader() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh',
      background: 'var(--tg-theme-bg-color)',
    }}>
      <style>{`
        @keyframes printerFeed {
          from { transform: translateY(-110px); }
          to   { transform: translateY(0); }
        }
        @keyframes shimmer {
          from { background-position: -300px 0; }
          to   { background-position:  300px 0; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Printer body */}
      <div style={{
        width: 180, height: 30, borderRadius: 10,
        background: 'var(--tg-theme-secondary-bg-color)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.06)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', zIndex: 2, flexShrink: 0,
      }}>
        {/* slot */}
        <div style={{
          width: 110, height: 5, borderRadius: 3,
          background: 'var(--tg-theme-bg-color)',
          boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.3)',
        }} />
        {/* indicator light */}
        <div style={{
          position: 'absolute', right: 14, width: 6, height: 6,
          borderRadius: '50%', background: '#34c759',
          boxShadow: '0 0 6px #34c759',
        }} />
      </div>

      {/* Receipt paper */}
      <div style={{ width: 180, overflow: 'hidden', flexShrink: 0 }}>
        <div style={{
          background: '#fff', color: '#1c1c1e',
          borderRadius: '0 0 4px 4px',
          padding: '14px 16px 22px',
          display: 'flex', flexDirection: 'column', gap: 7,
          boxShadow: '0 10px 32px rgba(0,0,0,0.18)',
          animation: 'printerFeed 0.7s cubic-bezier(0.22,1,0.36,1) 0.1s both',
          position: 'relative',
        }}>
          {/* Torn edge */}
          <div style={{
            position: 'absolute', bottom: -8, left: 0, right: 0, height: 10,
            background: 'radial-gradient(circle at 8px 0, var(--tg-theme-bg-color) 7px, transparent 7px) repeat-x, #fff',
            backgroundSize: '16px 10px, 100% 10px',
          }} />

          {/* Header */}
          <div style={{ textAlign: 'center', borderBottom: '1px dashed #ccc', paddingBottom: 8, marginBottom: 2 }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
              Split Lah Pte. Ltd.
            </div>
            <div style={{ fontSize: 8, color: '#999', marginTop: 2 }}>No chope, no peace.</div>
          </div>

          {/* Line items */}
          {[
            ['Laksa (extra cockles)', '$12.50'],
            ['Teh tarik, one more round', '$3.80'],
          ].map(([label, val]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 9, color: '#555', flex: 1 }}>{label}</span>
              <span style={{ fontSize: 9, fontWeight: 600, flexShrink: 0 }}>{val}</span>
            </div>
          ))}

          {/* Shimmer rows */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <ShimmerLine width="80px" />
            <ShimmerLine width="36px" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <ShimmerLine width="65px" />
            <ShimmerLine width="40px" />
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px dashed #ccc', margin: '2px 0' }} />

          {/* Footer small print */}
          <div style={{ fontSize: 7, color: '#bbb', textAlign: 'center', lineHeight: 1.5 }}>
            No GST • No service charge • Shiok right?
          </div>

          {/* Total */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Owe how much?
            </span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#2481cc' }}>
              $—
              <span style={{
                display: 'inline-block', width: 2, height: 12, background: '#2481cc',
                marginLeft: 1, verticalAlign: 'middle',
                animation: 'blink 0.8s step-end infinite',
              }} />
            </span>
          </div>
        </div>
      </div>

      {/* Status text */}
      <p style={{
        marginTop: 24, fontSize: 13, color: 'var(--tg-theme-hint-color)',
        animation: 'fadeIn 0.5s ease 0.6s both',
      }}>
        Calculating your split…
      </p>
    </div>
  )
}

function HomepageReceipt() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100dvh',
      background: 'var(--tg-theme-bg-color)',
    }}>
      <style>{`
        @keyframes dropIn {
          from { transform: translateY(-24px); opacity: 0; }
          to   { transform: translateY(0);     opacity: 1; }
        }
        @keyframes fadeUp {
          from { transform: translateY(10px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      {/* Receipt card */}
      <div style={{
        width: 200,
        background: '#fff', color: '#1c1c1e',
        borderRadius: '6px 6px 4px 4px',
        padding: '16px 18px 24px',
        display: 'flex', flexDirection: 'column', gap: 8,
        boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
        position: 'relative',
        animation: 'dropIn 0.55s cubic-bezier(0.34,1.56,0.64,1) 0.05s both',
      }}>
        {/* Torn bottom edge */}
        <div style={{
          position: 'absolute', bottom: -8, left: 0, right: 0, height: 10,
          background: 'radial-gradient(circle at 8px 0, var(--tg-theme-bg-color) 7px, transparent 7px) repeat-x, #fff',
          backgroundSize: '16px 10px, 100% 10px',
        }} />

        {/* Header */}
        <div style={{ textAlign: 'center', borderBottom: '1px dashed #ccc', paddingBottom: 10, marginBottom: 2 }}>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>
            Split Lah Pte. Ltd.
          </div>
          <div style={{ fontSize: 9, color: '#aaa', marginTop: 3 }}>Kiasu? Split fair fair.</div>
        </div>

        {/* Feature list */}
        {[
          ['Track expenses', '✓'],
          ['Split the bill', '✓'],
          ['Settle debts', '✓'],
          ['Blur like sotong?', 'We help'],
        ].map(([label, val]) => (
          <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ fontSize: 10, color: '#555' }}>{label}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: '#34c759' }}>{val}</span>
          </div>
        ))}

        <div style={{ borderTop: '1px dashed #ccc', margin: '2px 0' }} />

        {/* CTA */}
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 9, color: '#bbb', marginBottom: 6 }}>
            No GST • No service charge • Shiok right?
          </div>
          <div style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Bo jio? Cannot lah.
          </div>
        </div>
      </div>

      {/* Instruction */}
      <div style={{
        marginTop: 28, maxWidth: 220, textAlign: 'center',
        animation: 'fadeUp 0.4s ease 0.3s both',
      }}>
        <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Open from a group chat</p>
        <p style={{ fontSize: 12, color: 'var(--tg-theme-hint-color)', lineHeight: 1.5 }}>
          Send <strong>/start</strong> to the bot inside your Telegram group, then tap the button it sends.
        </p>
      </div>
    </div>
  )
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
    return <HomepageReceipt />
  }

  if (!ctx) {
    return <ReceiptLoader />
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
