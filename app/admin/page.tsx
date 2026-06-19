import { sql } from '@/lib/sql'
import { signOut } from '@/auth'
import Link from 'next/link'

export default async function AdminPage() {
  const groups = await sql`
    SELECT
      g.id, g.chat_id, g.title, g.currency,
      g.created_at,
      (SELECT COUNT(*) FROM members   WHERE group_id = g.id)                           AS member_count,
      (SELECT COUNT(*) FROM expenses  WHERE group_id = g.id AND deleted_at IS NULL)    AS expense_count,
      (SELECT COUNT(*) FROM settlements WHERE group_id = g.id AND deleted_at IS NULL)  AS settlement_count,
      (SELECT COALESCE(SUM(total_amount), 0)
         FROM expenses WHERE group_id = g.id AND deleted_at IS NULL)                   AS total_spend
    FROM groups g
    ORDER BY g.created_at DESC
  `

  const totalMembers  = groups.reduce((s, g) => s + Number(g.member_count), 0)
  const totalExpenses = groups.reduce((s, g) => s + Number(g.expense_count), 0)

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Admin — Split Lah</h1>
        <form action={async () => {
          'use server'
          await signOut({ redirectTo: '/admin/login' })
        }}>
          <button type="submit" style={{ fontSize: '0.8125rem', color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer' }}>
            Sign out
          </button>
        </form>
      </div>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '2rem' }}>
        {groups.length} groups · {totalMembers} members · {totalExpenses} expenses
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
            {['Group', 'Currency', 'Members', 'Expenses', 'Settlements', 'Total Spend', 'Created'].map(h => (
              <th key={h} style={{ textAlign: h === 'Group' || h === 'Currency' || h === 'Created' ? 'left' : 'right', padding: '0.5rem 0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map(g => (
            <tr key={String(g.id)} style={{ borderBottom: '1px solid #f3f4f6' }}>
              <td style={{ padding: '0.625rem 0.75rem' }}>
                <Link
                  href={`/admin/${g.id}`}
                  style={{ fontWeight: 600, color: '#2563eb', textDecoration: 'none' }}
                >
                  {String(g.title)}
                </Link>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '1px' }}>
                  {String(g.chat_id)}
                </div>
              </td>
              <td style={{ padding: '0.625rem 0.75rem' }}>{String(g.currency)}</td>
              <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>{String(g.member_count)}</td>
              <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>{String(g.expense_count)}</td>
              <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>{String(g.settlement_count)}</td>
              <td style={{ padding: '0.625rem 0.75rem', textAlign: 'right' }}>
                {String(g.currency)} {Number(g.total_spend).toFixed(2)}
              </td>
              <td style={{ padding: '0.625rem 0.75rem', color: '#6b7280' }}>
                {new Date(g.created_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
