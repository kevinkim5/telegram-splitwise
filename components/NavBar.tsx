'use client'

import { usePathname, useRouter } from 'next/navigation'

const tabs = [
  { label: 'Expenses', path: '/' },
  { label: 'Balances', path: '/balances' },
]

export function NavBar() {
  const pathname = usePathname()
  const router = useRouter()

  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        height: '60px',
        display: 'flex',
        borderTop: '1px solid var(--tg-theme-hint-color, #ddd)',
        background: 'var(--tg-theme-bg-color, #fff)',
        zIndex: 100,
      }}
    >
      {tabs.map(tab => {
        const active = tab.path === '/'
          ? pathname === '/' || pathname.startsWith('/add') || pathname.startsWith('/edit')
          : pathname === tab.path

        return (
          <button
            key={tab.path}
            onClick={() => router.push(tab.path)}
            style={{
              flex: 1,
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: active ? 600 : 400,
              color: active
                ? 'var(--tg-theme-button-color, #2481cc)'
                : 'var(--tg-theme-hint-color, #999)',
              transition: 'color 0.15s',
            }}
          >
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
