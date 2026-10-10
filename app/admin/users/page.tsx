import { sql } from '@/lib/sql'
import { signOut } from '@/auth'
import Link from 'next/link'
import { AdminNav } from '../AdminNav'

export const dynamic = 'force-dynamic'

export default async function AdminUsersPage() {
  const users = await sql`
    WITH latest AS (
      SELECT DISTINCT ON (telegram_user_id)
        telegram_user_id, first_name, last_name, username
      FROM members
      ORDER BY telegram_user_id, created_at DESC
    )
    SELECT
      l.telegram_user_id,
      l.first_name,
      l.last_name,
      l.username,
      COUNT(m.id)::int AS group_count,
      json_agg(json_build_object('id', g.id, 'title', g.title) ORDER BY g.title) AS groups
    FROM latest l
    JOIN members m ON m.telegram_user_id = l.telegram_user_id
    JOIN groups  g ON g.id = m.group_id
    GROUP BY l.telegram_user_id, l.first_name, l.last_name, l.username
    ORDER BY l.first_name, l.last_name NULLS LAST
  `

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.25rem 1rem 2rem' }}>
      <style>{`
        .admin-users-list details summary { list-style: none; }
        .admin-users-list details summary::-webkit-details-marker { display: none; }
        .admin-users-list details summary::after { content: '▼'; font-size: 10px; color: #9ca3af; flex-shrink: 0; }
        .admin-users-list details[open] summary::after { content: '▲'; }
      `}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Split Admin</h1>
        <form action={async () => {
          'use server'
          await signOut({ redirectTo: '/admin/login' })
        }}>
          <button type="submit" style={{ fontSize: '0.8125rem', color: '#6b7280', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer' }}>
            Sign out
          </button>
        </form>
      </div>
      <p style={{ color: '#6b7280', fontSize: '0.8125rem', marginBottom: '1.25rem' }}>
        {users.length} users
      </p>

      <AdminNav active="users" />

      {/* Users list */}
      <div className="admin-users-list" style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
        {users.length === 0 && (
          <div style={{ padding: '0.75rem 1rem', color: '#6b7280', fontSize: '0.875rem' }}>No users yet.</div>
        )}
        {users.map((u, i) => {
          const isLast = i === users.length - 1
          const groups = u.groups as Array<{ id: number; title: string }>
          const groupCount = Number(u.group_count)
          const displayName = `${u.first_name}${u.last_name ? ` ${u.last_name}` : ''}`

          return (
            <details
              key={String(u.telegram_user_id)}
              style={{ borderBottom: isLast ? 'none' : '0.5px solid #f3f4f6' }}
            >
              <summary style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.75rem 1rem', cursor: 'pointer',
              }}>
                <span style={{ fontWeight: 500, fontSize: '0.875rem', color: '#111827', flexShrink: 0 }}>
                  {displayName}
                </span>
                <span style={{ fontSize: '0.8125rem', color: '#6b7280', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {u.username ? `@${u.username}` : '—'}
                </span>
                <span style={{ fontSize: '0.8125rem', color: '#6b7280', flexShrink: 0 }}>
                  {groupCount} {groupCount === 1 ? 'group' : 'groups'}
                </span>
              </summary>
              <div style={{ padding: '0.5rem 1rem 0.75rem', borderTop: '0.5px solid #f3f4f6', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                {groups.map(g => (
                  <Link
                    key={g.id}
                    href={`/admin/${g.id}`}
                    style={{ fontSize: '0.8125rem', color: '#2563eb', textDecoration: 'none' }}
                  >
                    {String(g.title)} →
                  </Link>
                ))}
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}
