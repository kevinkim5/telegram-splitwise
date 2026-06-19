import { sql } from '@/lib/sql'
import { signOut } from '@/auth'
import Link from 'next/link'
import { simplifyDebts, type NamedBalance } from '@/lib/balances'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '2.5rem' }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6b7280', marginBottom: '0.75rem' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

export default async function AdminGroupPage({
  params,
}: {
  params: Promise<{ groupId: string }>
}) {
  const { groupId } = await params

  const [group] = await sql`SELECT * FROM groups WHERE id = ${parseInt(groupId)}`
  if (!group) {
    return <div style={{ padding: '3rem', fontFamily: 'system-ui, sans-serif' }}>Group not found.</div>
  }

  const [members, expenseRows, settlementRows, splitRows] = await Promise.all([
    sql`SELECT * FROM members WHERE group_id = ${group.id} ORDER BY first_name`,
    sql`
      SELECT e.*, m.first_name || COALESCE(' ' || m.last_name, '') AS paid_by_name
      FROM expenses e
      JOIN members m ON m.id = e.paid_by_member_id
      WHERE e.group_id = ${group.id} AND e.deleted_at IS NULL
      ORDER BY e.date DESC, e.created_at DESC
      LIMIT 100
    `,
    sql`
      SELECT s.*,
        fm.first_name || COALESCE(' ' || fm.last_name, '') AS from_name,
        tm.first_name || COALESCE(' ' || tm.last_name, '') AS to_name
      FROM settlements s
      JOIN members fm ON fm.id = s.from_member_id
      JOIN members tm ON tm.id = s.to_member_id
      WHERE s.group_id = ${group.id} AND s.deleted_at IS NULL
      ORDER BY s.created_at DESC
    `,
    sql`
      SELECT e.paid_by_member_id, e.currency, es.member_id, es.amount
      FROM expenses e
      JOIN expense_splits es ON es.expense_id = e.id
      WHERE e.group_id = ${group.id} AND e.deleted_at IS NULL
    `,
  ])

  const memberIds = members.map(m => m.id as number)
  const memberNameMap = new Map(members.map(m => [
    m.id as number,
    `${m.first_name}${m.last_name ? ' ' + m.last_name : ''}`,
  ]))

  const netByCurrency = new Map<string, Map<number, number>>()
  const getOrInit = (cur: string) => {
    if (!netByCurrency.has(cur)) netByCurrency.set(cur, new Map(memberIds.map(id => [id, 0])))
    return netByCurrency.get(cur)!
  }

  for (const r of splitRows) {
    const payer = r.paid_by_member_id as number
    const splitter = r.member_id as number
    const amount = parseFloat(r.amount as string)
    const cur = r.currency as string
    if (payer !== splitter) {
      const map = getOrInit(cur)
      map.set(payer, (map.get(payer) ?? 0) + amount)
      map.set(splitter, (map.get(splitter) ?? 0) - amount)
    }
  }
  for (const r of settlementRows) {
    const from = r.from_member_id as number
    const to = r.to_member_id as number
    const amount = parseFloat(r.amount as string)
    const cur = r.currency as string
    const map = getOrInit(cur)
    map.set(from, (map.get(from) ?? 0) + amount)
    map.set(to, (map.get(to) ?? 0) - amount)
  }

  const allDebts = [...netByCurrency.entries()].flatMap(([cur, memberMap]) => {
    const balances: NamedBalance[] = [...memberMap.entries()].map(([memberId, netAmount]) => ({
      member_id: memberId,
      member_name: memberNameMap.get(memberId) ?? 'Unknown',
      net_amount: Math.round(netAmount * 100) / 100,
      currency: cur,
    }))
    return simplifyDebts(balances)
  })

  const thStyle: React.CSSProperties = { textAlign: 'left', padding: '0.5rem 0.75rem', color: '#6b7280', fontWeight: 600, textTransform: 'uppercase', fontSize: '0.75rem', letterSpacing: '0.05em', borderBottom: '2px solid #e5e7eb' }
  const tdStyle: React.CSSProperties = { padding: '0.5rem 0.75rem', borderBottom: '1px solid #f3f4f6', fontSize: '0.875rem', verticalAlign: 'top' }

  return (
    <div style={{ padding: '2rem', fontFamily: 'system-ui, sans-serif', maxWidth: '960px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <Link href="/admin" style={{ fontSize: '0.875rem', color: '#2563eb', textDecoration: 'none' }}>
          ← All groups
        </Link>
        <form action={async () => {
          'use server'
          await signOut({ redirectTo: '/admin/login' })
        }}>
          <button type="submit" style={{ fontSize: '0.8125rem', color: '#6b7280', background: 'none', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer' }}>
            Sign out
          </button>
        </form>
      </div>

      <h1 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        {String(group.title)}
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.875rem', marginBottom: '2rem' }}>
        Chat ID: {String(group.chat_id)} · Currency: {String(group.currency)} · {members.length} members · {expenseRows.length} expenses shown
      </p>

      {/* Balances */}
      <Section title="Outstanding Balances">
        {allDebts.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>All settled up ✓</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Owes</th>
                <th style={thStyle}>To</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {allDebts.map((d, i) => (
                <tr key={i}>
                  <td style={tdStyle}>{d.from_name}</td>
                  <td style={tdStyle}>{d.to_name}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#dc2626' }}>
                    {d.currency} {d.amount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Members */}
      <Section title={`Members (${members.length})`}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={thStyle}>Name</th>
              <th style={thStyle}>Username</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Telegram ID</th>
              <th style={{ ...thStyle, textAlign: 'right' }}>Joined</th>
            </tr>
          </thead>
          <tbody>
            {members.map(m => (
              <tr key={String(m.id)}>
                <td style={{ ...tdStyle, fontWeight: 500 }}>
                  {String(m.first_name)}{m.last_name ? ` ${m.last_name}` : ''}
                </td>
                <td style={{ ...tdStyle, color: '#6b7280' }}>
                  {m.username ? `@${m.username}` : '—'}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#6b7280', fontFamily: 'monospace' }}>
                  {String(m.telegram_user_id)}
                </td>
                <td style={{ ...tdStyle, textAlign: 'right', color: '#6b7280' }}>
                  {new Date(m.created_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      {/* Expenses */}
      <Section title={`Expenses (${expenseRows.length})`}>
        {expenseRows.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No expenses yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>Description</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Paid by</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {expenseRows.map(e => (
                <tr key={String(e.id)}>
                  <td style={{ ...tdStyle, color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {new Date(e.date as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ ...tdStyle, fontWeight: 500 }}>{String(e.description)}</td>
                  <td style={{ ...tdStyle, color: '#6b7280' }}>{e.category ? String(e.category) : '—'}</td>
                  <td style={{ ...tdStyle, color: '#6b7280' }}>{String(e.paid_by_name)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>
                    {String(e.currency)} {Number(e.total_amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      {/* Settlements */}
      <Section title={`Settlements (${settlementRows.length})`}>
        {settlementRows.length === 0 ? (
          <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No settlements yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Date</th>
                <th style={thStyle}>From</th>
                <th style={thStyle}>To</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
              </tr>
            </thead>
            <tbody>
              {settlementRows.map(s => (
                <tr key={String(s.id)}>
                  <td style={{ ...tdStyle, color: '#6b7280', whiteSpace: 'nowrap' }}>
                    {new Date(s.created_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </td>
                  <td style={{ ...tdStyle }}>{String(s.from_name)}</td>
                  <td style={{ ...tdStyle }}>{String(s.to_name)}</td>
                  <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#16a34a' }}>
                    {String(s.currency)} {Number(s.amount).toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}
