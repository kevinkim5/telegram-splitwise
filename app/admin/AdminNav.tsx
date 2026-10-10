import Link from 'next/link'

const TABS = [
  { href: '/admin', label: 'Groups', key: 'groups' },
  { href: '/admin/users', label: 'Users', key: 'users' },
  { href: '/admin/usage', label: 'Usage', key: 'usage' },
] as const

export function AdminNav({ active, style }: { active: (typeof TABS)[number]['key']; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem', ...style }}>
      {TABS.map(t => t.key === active ? (
        <span key={t.key} style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', padding: '0.375rem 0.75rem', borderRadius: '999px', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          {t.label}
        </span>
      ) : (
        <Link key={t.key} href={t.href} style={{ fontSize: '0.875rem', fontWeight: 400, color: '#6b7280', textDecoration: 'none', padding: '0.375rem 0.75rem', borderRadius: '999px' }}>
          {t.label}
        </Link>
      ))}
    </div>
  )
}
