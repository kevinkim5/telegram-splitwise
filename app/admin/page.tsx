import { sql } from '@/lib/sql'
import { signOut } from '@/auth'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function AdminPage() {
  const groups = await sql`
    SELECT
      g.id, g.title, g.created_at,
      (SELECT COUNT(*) FROM members     WHERE group_id = g.id)                          AS member_count,
      (SELECT COUNT(*) FROM expenses    WHERE group_id = g.id AND deleted_at IS NULL)   AS expense_count,
      (SELECT COUNT(*) FROM settlements WHERE group_id = g.id AND deleted_at IS NULL)   AS settlement_count,
      NOT EXISTS (
        SELECT 1
        FROM (
          SELECT SUM(flow) AS net
          FROM (
            SELECT e.paid_by_member_id AS m_id, e.currency, es.amount AS flow
            FROM expenses e JOIN expense_splits es ON es.expense_id = e.id
            WHERE e.group_id = g.id AND e.deleted_at IS NULL AND es.member_id != e.paid_by_member_id
            UNION ALL
            SELECT es.member_id, e.currency, -es.amount
            FROM expenses e JOIN expense_splits es ON es.expense_id = e.id
            WHERE e.group_id = g.id AND e.deleted_at IS NULL AND es.member_id != e.paid_by_member_id
            UNION ALL
            SELECT from_member_id, currency, amount FROM settlements WHERE group_id = g.id AND deleted_at IS NULL
            UNION ALL
            SELECT to_member_id, currency, -amount FROM settlements WHERE group_id = g.id AND deleted_at IS NULL
          ) flows
          GROUP BY m_id, currency
          HAVING ABS(SUM(flow)) > 0.005
        ) outstanding
      ) AS is_settled
    FROM groups g
    ORDER BY g.created_at DESC
  `

  const totalMembers  = groups.reduce((s, g) => s + Number(g.member_count), 0)
  const totalExpenses = groups.reduce((s, g) => s + Number(g.expense_count), 0)

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.25rem 1rem 2rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>Split Lah Admin</h1>
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
        {groups.length} groups · {totalMembers} members · {totalExpenses} expenses
      </p>

      {/* Nav */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.25rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', padding: '0.375rem 0.75rem', borderRadius: '999px', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          Groups
        </span>
        <Link href="/admin/users" style={{ fontSize: '0.875rem', fontWeight: 400, color: '#6b7280', textDecoration: 'none', padding: '0.375rem 0.75rem', borderRadius: '999px' }}>
          Users
        </Link>
      </div>

      {/* Group cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {groups.map(g => (
          <Link
            key={String(g.id)}
            href={`/admin/${g.id}`}
            style={{ textDecoration: 'none', color: 'inherit' }}
          >
            <div style={{ background: '#fff', borderRadius: '12px', padding: '1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>{String(g.title)}</span>
                {g.is_settled ? (
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', borderRadius: '999px', padding: '0.125rem 0.625rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                    Settled
                  </span>
                ) : (
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#dc2626', background: '#fef2f2', borderRadius: '999px', padding: '0.125rem 0.625rem', flexShrink: 0, marginLeft: '0.5rem' }}>
                    Outstanding
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8125rem', color: '#6b7280' }}>
                <div style={{ display: 'flex', gap: '1rem' }}>
                  <span>{String(g.member_count)} members</span>
                  <span>{String(g.expense_count)} expenses</span>
                  <span>{String(g.settlement_count)} settlements</span>
                </div>
                <span style={{ flexShrink: 0, marginLeft: '0.5rem' }}>
                  {new Date(g.created_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
