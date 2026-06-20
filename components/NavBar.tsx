'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useAppContext } from '@/components/AppProvider'

const tabs = [
  { label: 'Expenses', icon: '🧾', path: '/' },
  { label: 'Totals', icon: '📊', path: '/totals' },
  { label: 'Balances', icon: '⚖️', path: '/balances' },
]

export function NavBar() {
  const pathname = usePathname()
  const router = useRouter()
  const { chatId } = useAppContext()

  const navigate = (path: string) => {
    router.push(`${path}?chatId=${chatId}`)
  }

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 flex"
      style={{
        height: '64px',
        background: 'var(--tg-theme-bg-color)',
        borderTop: '0.5px solid rgba(0,0,0,0.1)',
        zIndex: 100,
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {tabs.map(tab => {
        const active = tab.path === '/'
          ? pathname === '/' || pathname.startsWith('/add') || pathname.startsWith('/edit')
          : pathname.startsWith(tab.path)

        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 border-none cursor-pointer"
            style={{
              background: 'none',
              color: active ? 'var(--tg-theme-button-color)' : 'var(--tg-theme-hint-color)',
            }}
          >
            <span className="text-xl">{tab.icon}</span>
            <span
              className="text-xs"
              style={{ fontWeight: active ? 600 : 400 }}
            >
              {tab.label}
            </span>
          </button>
        )
      })}
    </nav>
  )
}
