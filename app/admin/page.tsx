import { sql } from '@/lib/sql'
import { auth, signOut } from '@/auth'
import { revalidatePath } from 'next/cache'
import { ensureSchema } from '@/lib/db'
import { AdminNav } from './AdminNav'
import { GroupsList } from './GroupsList'
import { isEmptyPrivateChat, type AdminGroupRow } from '@/lib/admin-groups'

export const dynamic = 'force-dynamic'

async function archiveGroup(id: number) {
  'use server'
  if (!(await auth())) throw new Error('Unauthorized')
  await sql`UPDATE groups SET deleted_at = NOW() WHERE id = ${id} AND deleted_at IS NULL`
  revalidatePath('/admin')
}

// The activity log table is created by ensureSchema(), which normally runs when someone opens the
// app. If an admin gets here first after a deploy, create it now and retry once.
async function withSchema<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run()
  } catch {
    await ensureSchema()
    return run()
  }
}

export default async function AdminPage() {
  const [activeGroups, archivedGroups] = await withSchema(() => Promise.all([
    sql`
      SELECT
        g.id, g.title, g.currency, g.created_at, g.chat_id::text AS chat_id,
        -- last time anything happened in the group: someone joined, an expense or settlement was
        -- added or deleted, or an expense was edited (GREATEST ignores the NULLs of empty groups)
        GREATEST(
          g.created_at,
          (SELECT MAX(created_at) FROM members WHERE group_id = g.id),
          (SELECT MAX(GREATEST(created_at, deleted_at)) FROM expenses WHERE group_id = g.id),
          (SELECT MAX(GREATEST(created_at, deleted_at)) FROM settlements WHERE group_id = g.id),
          (SELECT MAX(ev.created_at) FROM expense_events ev JOIN expenses e ON e.id = ev.expense_id WHERE e.group_id = g.id)
        ) AS last_activity,
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
  ]))

  const groupRows: AdminGroupRow[] = activeGroups.map(g => ({
    id: g.id as number,
    title: String(g.title),
    currency: String(g.currency),
    created_at: new Date(g.created_at as string).toISOString(),
    last_activity: new Date(g.last_activity as string).toISOString(),
    chat_id: String(g.chat_id),
    member_count: Number(g.member_count),
    expense_count: Number(g.expense_count),
    settlement_count: Number(g.settlement_count),
    is_settled: !!g.is_settled,
  }))
  const emptyPrivate = groupRows.filter(isEmptyPrivateChat).length

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
        {activeGroups.length - emptyPrivate} groups{emptyPrivate > 0 ? ` (+${emptyPrivate} empty private)` : ''} · {totalMembers} members · {totalExpenses} expenses
      </p>

      <AdminNav active="groups" style={{ marginBottom: '1.5rem' }} />

      <GroupsList groups={groupRows} archive={archiveGroup} />

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
                style={{ background: '#fff', borderRadius: '12px', padding: '0.75rem 1rem', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', opacity: 0.6 }}
              >
                <span style={{ fontWeight: 600, fontSize: '0.875rem', color: '#111827' }}>{String(g.title)}</span>
                <span style={{ fontSize: '0.75rem', color: '#9ca3af', marginLeft: '0.5rem' }}>{String(g.currency)}</span>
                <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>
                  {String(g.member_count)} members · {String(g.expense_count)} expenses · archived {new Date(g.deleted_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  )
}
