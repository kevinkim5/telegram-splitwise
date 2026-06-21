import { sql } from '@/lib/sql'
import { signOut } from '@/auth'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

async function archiveGroup(id: number, _formData: FormData) {
  'use server'
  await sql`UPDATE groups SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL`
  revalidatePath('/admin')
}

async function restoreGroup(id: number, _formData: FormData) {
  'use server'
  await sql`UPDATE groups SET deleted_at = NULL WHERE id = ${id} AND deleted_at IS NOT NULL`
  revalidatePath('/admin')
}


export default async function AdminPage() {
  const [activeGroups, archivedGroups] = await Promise.all([
    sql`
      SELECT
        g.id, g.title, g.currency, g.created_at,
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
      WHERE g.deleted_at IS NULL
      ORDER BY g.created_at DESC
    `,
    sql`
      SELECT g.id, g.title, g.currency, g.deleted_at,
        (SELECT COUNT(*) FROM members     WHERE group_id = g.id) AS member_count,
        (SELECT COUNT(*) FROM expenses    WHERE group_id = g.id AND deleted_at IS NULL) AS expense_count
      FROM groups g
      WHERE g.deleted_at IS NOT NULL
      ORDER BY g.deleted_at DESC
    `,
  ])

  const totalMembers  = activeGroups.reduce((s, g) => s + Number(g.member_count), 0)
  const totalExpenses = activeGroups.reduce((s, g) => s + Number(g.expense_count), 0)

  return (
    <div style={{ maxWidth: '680px', margin: '0 auto', padding: '1.5rem 1rem 2rem' }}>

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
        {activeGroups.length} groups · {totalMembers} members · {totalExpenses} expenses
      </p>

      {/* Nav */}
      <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', padding: '0.375rem 0.75rem', borderRadius: '999px', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          Groups
        </span>
        <Link href="/admin/users" style={{ fontSize: '0.875rem', fontWeight: 400, color: '#6b7280', textDecoration: 'none', padding: '0.375rem 0.75rem', borderRadius: '999px' }}>
          Users
        </Link>
      </div>

      {/* Active group cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
        {activeGroups.map(g => (
          <div key={String(g.id)} style={{ display: 'flex', alignItems: 'stretch', gap: '0.5rem' }}>
            <Link
              href={`/admin/${g.id}`}
              style={{ textDecoration: 'none', color: 'inherit', flex: 1 }}
            >
              <div style={{ background: '#fff', borderRadius: '14px', padding: '1rem 1.125rem', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', transition: 'box-shadow 0.15s', height: '100%' }}>

                {/* Row 1: title + status */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827' }}>{String(g.title)}</span>
                  {g.is_settled ? (
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#16a34a', background: '#f0fdf4', borderRadius: '999px', padding: '0.1875rem 0.625rem', flexShrink: 0, marginLeft: '0.75rem' }}>
                      Settled
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#dc2626', background: '#fef2f2', borderRadius: '999px', padding: '0.1875rem 0.625rem', flexShrink: 0, marginLeft: '0.75rem' }}>
                      Outstanding
                    </span>
                  )}
                </div>

                {/* Row 2: currency + date */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563eb', background: '#eff6ff', borderRadius: '6px', padding: '0.125rem 0.5rem' }}>
                    {String(g.currency)}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    {new Date(g.created_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>

                {/* Row 3: stats */}
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[
                    { label: 'members',     value: String(g.member_count) },
                    { label: 'expenses',    value: String(g.expense_count) },
                    { label: 'settlements', value: String(g.settlement_count) },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '0.4375rem 0.625rem' }}>
                      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{value}</div>
                      <div style={{ fontSize: '0.6875rem', color: '#9ca3af', marginTop: '0.125rem' }}>{label}</div>
                    </div>
                  ))}
                </div>

              </div>
            </Link>

            {/* Archive button — separate from the link, no event handler needed */}
            <form action={archiveGroup.bind(null, g.id as number)} style={{ display: 'flex' }}>
              <button
                type="submit"
                title="Archive group"
                style={{ fontSize: '0.6875rem', color: '#9ca3af', background: '#fff', border: 'none', cursor: 'pointer', borderRadius: '14px', padding: '0 0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', whiteSpace: 'nowrap' }}
              >
                Archive
              </button>
            </form>
          </div>
        ))}
      </div>

      {/* Archived groups */}
      {archivedGroups.length > 0 && (
        <>
          <p style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#9ca3af', marginBottom: '0.625rem', paddingLeft: '0.25rem' }}>
            Archived ({archivedGroups.length})
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {archivedGroups.map(g => (
              <div
                key={String(g.id)}
                style={{ background: '#fff', borderRadius: '12px', padding: '0.75rem 1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', opacity: 0.6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}
              >
                <div style={{ minWidth: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{String(g.title)}</span>
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: '0.5rem' }}>{String(g.currency)}</span>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>
                    {String(g.member_count)} members · {String(g.expense_count)} expenses · archived {new Date(g.deleted_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <form action={restoreGroup.bind(null, g.id as number)} style={{ flexShrink: 0 }}>
                  <button
                    type="submit"
                    style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563eb', background: '#eff6ff', border: 'none', borderRadius: '6px', padding: '0.3125rem 0.625rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Restore
                  </button>
                </form>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  )
}
