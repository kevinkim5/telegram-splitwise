import { useLocation, useNavigate } from 'react-router-dom'

const tabs = [
  { path: '/', label: 'Expenses', icon: '📋' },
  { path: '/add', label: 'Add', icon: '＋' },
  { path: '/balances', label: 'Balances', icon: '⚖️' },
]

export function NavBar() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      display: 'flex',
      background: 'var(--tg-theme-bg-color, #fff)',
      borderTop: '1px solid var(--tg-theme-hint-color, #ddd)',
      zIndex: 100,
    }}>
      {tabs.map(tab => {
        const active = location.pathname === tab.path ||
          (tab.path === '/' && location.pathname.startsWith('/edit'))
        return (
          <button
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              flex: 1, padding: '10px 0', border: 'none', background: 'none',
              cursor: 'pointer', display: 'flex', flexDirection: 'column',
              alignItems: 'center', gap: '2px',
              color: active
                ? 'var(--tg-theme-button-color, #2196f3)'
                : 'var(--tg-theme-hint-color, #999)',
              fontWeight: active ? '600' : '400',
              fontSize: '11px',
            }}
          >
            <span style={{ fontSize: '20px' }}>{tab.icon}</span>
            {tab.label}
          </button>
        )
      })}
    </nav>
  )
}
