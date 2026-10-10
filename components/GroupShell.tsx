'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAppContext } from '@/components/AppProvider'
import { GroupDataProvider, useGroupData } from '@/components/GroupData'
import { MemberAvatar, GearIcon, MembersSheet, SettingsSheet } from '@/components/GroupSheets'
import { ExpensesPage } from '@/components/ExpensesPage'
import { BalancesPage } from '@/components/BalancesPage'
import { TotalsPage } from '@/components/TotalsPage'
import { CONVERT_TO, sumConverted } from '@/lib/convert'
import { useRates } from '@/lib/use-rates'
import { useShowSkeleton } from '@/lib/use-show-skeleton'

type TabKey = 'expenses' | 'balances' | 'totals'

const TABS: { key: TabKey; label: string; path: string }[] = [
  { key: 'expenses', label: 'Expenses', path: '/' },
  { key: 'balances', label: 'Balances', path: '/balances' },
  { key: 'totals', label: 'Totals', path: '/totals' },
]

const tabFromPath = (pathname: string): TabKey =>
  pathname.startsWith('/balances') ? 'balances' : pathname.startsWith('/totals') ? 'totals' : 'expenses'

// The one-line "You owe ≈ SGD 52.09" under the group name. A fixed-height slot, so the header never
// changes size when it fills in. The per-currency breakdown lives in the Balances tab.
function MySummary() {
  const { currentMember } = useAppContext()
  const { balances, balancesLoading } = useGroupData()
  const lines = balances
    ? Object.entries(balances.balances_by_currency).flatMap(([currency, bals]) => {
        const mine = bals.find(b => b.member_id === currentMember.id)
        return mine && Math.abs(mine.net_amount) > 0.005 ? [{ currency, net: mine.net_amount }] : []
      })
    : []
  const { rates, failed } = useRates(lines.map(l => l.currency))
  const shimmer = useShowSkeleton(balancesLoading && !balances)

  let text: string | null = null
  let color = 'var(--tg-theme-hint-color)'
  if (balances) {
    if (lines.length === 0) {
      text = 'All settled up ✓'
    } else {
      const sum = sumConverted(lines, rates, CONVERT_TO)
      if (sum.usedAny && sum.missing.length === 0) {
        const approx = lines.some(l => l.currency !== CONVERT_TO) ? '≈ ' : ''
        if (Math.abs(sum.total) < 0.005) { text = 'Evens out' }
        else if (sum.total < 0) { text = `You owe ${approx}${CONVERT_TO} ${Math.abs(sum.total).toFixed(2)}`; color = 'var(--tg-theme-destructive-text-color, #ff3b30)' }
        else { text = `You get back ${approx}${CONVERT_TO} ${sum.total.toFixed(2)}`; color = 'var(--tg-theme-button-color)' }
      } else if (rates || failed) {
        // no usable rates: show the amounts as they are rather than a wrong total
        const owe = lines.filter(l => l.net < 0), back = lines.filter(l => l.net > 0)
        text = [
          owe.length ? `You owe ${owe.map(l => `${l.currency} ${Math.abs(l.net).toFixed(2)}`).join(' + ')}` : '',
          back.length ? `You get back ${back.map(l => `${l.currency} ${l.net.toFixed(2)}`).join(' + ')}` : '',
        ].filter(Boolean).join(' · ')
        color = 'var(--tg-theme-hint-color)'
      }
      // else: rates still loading. Keep the slot empty rather than flash original amounts.
    }
  }

  return (
    <div style={{ height: 16, marginTop: 2 }}>
      {text
        ? <p className="text-xs font-medium truncate" style={{ color, lineHeight: '16px' }}>{text}</p>
        : shimmer && <div className="skeleton" style={{ height: 12, width: 134, borderRadius: 3, marginTop: 2 }} />}
    </div>
  )
}

function Shell() {
  const router = useRouter()
  const pathname = usePathname()
  const { chatId, group, members } = useAppContext()
  const active = tabFromPath(pathname)
  const [showMembers, setShowMembers] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  // A tab mounts the first time it is opened and then stays mounted (hidden), so switching back
  // is instant and keeps its scroll position and anything typed or expanded in it.
  const [opened, setOpened] = useState<Set<TabKey>>(() => new Set([active]))
  useEffect(() => { setOpened(prev => (prev.has(active) ? prev : new Set(prev).add(active))) }, [active])

  const switchTab = (tab: (typeof TABS)[number]) => {
    if (tab.key === active) return
    window.Telegram?.WebApp?.HapticFeedback?.selectionChanged?.()
    // Update the URL without a server round trip or a history entry
    window.history.replaceState(null, '', `${tab.path}?chatId=${chatId}`)
  }

  return (
    <div className="flex flex-col h-full min-h-0 relative">
      <div className="flex-shrink-0 px-4 pt-3" style={{ background: 'var(--tg-theme-bg-color)' }}>
        <div className="flex items-start justify-between">
          <div className="flex-1 min-w-0 pr-3">
            <h1 className="font-bold text-lg leading-tight truncate">{group.title}</h1>
            <MySummary />
          </div>
          <div className="flex items-center gap-2 flex-shrink-0" style={{ paddingTop: 2 }}>
            <button
              onClick={() => setShowMembers(true)}
              className="flex items-center"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              aria-label="Group members"
            >
              {members.slice(0, 3).map(m => (
                <div key={m.id} style={{ marginRight: -8, borderRadius: '50%', border: '2px solid var(--tg-theme-bg-color)', lineHeight: 0, flexShrink: 0 }}>
                  <MemberAvatar member={m} size={26} />
                </div>
              ))}
              {members.length > 3 && (
                <div
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--tg-theme-secondary-bg-color)', border: '2px solid var(--tg-theme-bg-color)', fontSize: '10px', fontWeight: 700, color: 'var(--tg-theme-hint-color)' }}
                >
                  +{members.length - 3}
                </div>
              )}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center justify-center w-8 h-8 rounded-full"
              style={{ background: 'var(--tg-theme-secondary-bg-color)', border: 'none', cursor: 'pointer', color: 'var(--tg-theme-hint-color)', marginLeft: 4 }}
              aria-label="Group settings"
            >
              <GearIcon />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div role="tablist" aria-label="Group sections" className="flex" style={{ gap: 2, background: 'var(--tg-theme-secondary-bg-color)', borderRadius: 999, padding: 3, margin: '8px 0 10px' }}>
          {TABS.map(t => (
            <button
              key={t.key}
              role="tab"
              aria-selected={t.key === active}
              onClick={() => switchTab(t)}
              className="flex-1 text-sm"
              style={{
                border: 'none', cursor: 'pointer', borderRadius: 999, padding: '6px 4px',
                fontWeight: t.key === active ? 600 : 500,
                background: t.key === active ? 'var(--tg-theme-bg-color)' : 'transparent',
                color: t.key === active ? 'var(--tg-theme-text-color)' : 'var(--tg-theme-hint-color)',
                boxShadow: t.key === active ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab contents: stacked in the same place, only the active one visible */}
      <div className="flex-1 min-h-0 relative" style={{ boxShadow: 'inset 0 1px 0 rgba(0,0,0,0.08)' }}>
        {([
          ['expenses', ExpensesPage],
          ['balances', BalancesPage],
          ['totals', TotalsPage],
        ] as const).map(([key, Tab]) => opened.has(key) && (
          <div
            key={key}
            role="tabpanel"
            aria-hidden={key !== active}
            inert={key !== active}
            className="absolute inset-0 flex flex-col"
            style={{ visibility: key === active ? 'visible' : 'hidden' }}
          >
            <Tab />
          </div>
        ))}
      </div>

      <button
        onClick={() => router.push(`/add?chatId=${chatId}`)}
        aria-label="Add expense"
        className="absolute flex items-center justify-center"
        style={{
          right: 16, bottom: 'calc(env(safe-area-inset-bottom) + 20px)', width: 52, height: 52, borderRadius: '50%',
          background: 'var(--tg-theme-button-color)', color: 'var(--tg-theme-button-text-color)', border: 'none',
          fontSize: 30, lineHeight: 1, cursor: 'pointer', zIndex: 40, boxShadow: '0 4px 12px rgba(0,0,0,0.25)',
        }}
      >
        +
      </button>

      {showMembers && <MembersSheet onClose={() => setShowMembers(false)} />}
      {showSettings && <SettingsSheet onClose={() => setShowSettings(false)} />}
    </div>
  )
}

export function GroupShell() {
  return (
    <GroupDataProvider>
      <Shell />
    </GroupDataProvider>
  )
}
