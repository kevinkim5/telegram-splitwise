import { sql } from '@/lib/sql'
import { auth, signOut } from '@/auth'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { simplifyDebts, type NamedBalance } from '@/lib/balances'
import { AdminBalances, type AdminMember } from './AdminBalances'
import { ExpensesList, type AdminExpense, type HistoryEvent } from './ExpensesList'
import { SettlementsList, type AdminSettlement } from './SettlementsList'
import { GroupTotals } from './GroupTotals'
import { AdminTabs, parseTab } from './AdminTabs'
import { ExpenseFilterBar } from './ExpenseFilterBar'
import { expensesHref, isFiltered, parseAdminFilter } from '@/lib/admin-expense-filter'
import { escapeLike } from '@/lib/expense-filter'
import { ADMIN_PAGE_SIZE, pageCount, parsePage, rangeLabel } from '@/lib/pagination'
import { insertEvent } from '@/lib/expense-events'
import { ensureSchema } from '@/lib/db'
import type { Change } from '@/lib/expense-history'

export const dynamic = 'force-dynamic'

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: '1.75rem' }}>
      {title && (
        <h2 style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#6b7280', marginBottom: '0.5rem', paddingLeft: '0.25rem' }}>
          {title}
        </h2>
      )}
      <div style={{ background: '#fff', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
        {children}
      </div>
    </section>
  )
}

const pagerLink: React.CSSProperties = { color: '#2563eb', fontWeight: 600, textDecoration: 'none', minWidth: 64 }

function Row({ children, last }: { children: React.ReactNode; last?: boolean }) {
  return (
    <div style={{ padding: '0.75rem 1rem', borderBottom: last ? 'none' : '0.5px solid #f3f4f6' }}>
      {children}
    </div>
  )
}

export default async function AdminGroupPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupId: string }>
  searchParams?: Promise<{ tab?: string; page?: string; deleted?: string; sdeleted?: string; q?: string; from?: string; to?: string }>
}) {
  const { groupId } = await params
  const sp = (await searchParams) ?? {}
  const tab = parseTab(sp.tab)
  const showDeleted = sp.deleted === '1'            // include deleted expenses in the list
  const showDeletedSettlements = sp.sdeleted === '1'
  const filter = parseAdminFilter(sp)
  const filtered = isFiltered(filter)
  const pattern = filter.q ? `%${escapeLike(filter.q)}%` : null

  const [group] = await sql`SELECT * FROM groups WHERE id = ${parseInt(groupId)}`
  if (!group) {
    return <div style={{ padding: '3rem' }}>Group not found.</div>
  }

  // Always needed: the header figures and the counts used by the tabs
  const [[counts], [sCounts], currencyTotals, [mCount]] = await Promise.all([
    sql`
      SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active,
             COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted
      FROM expenses WHERE group_id = ${group.id}
    `,
    sql`
      SELECT COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active,
             COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS deleted
      FROM settlements WHERE group_id = ${group.id}
    `,
    sql`
      SELECT currency, SUM(total_amount) AS total
      FROM expenses
      WHERE group_id = ${group.id} AND deleted_at IS NULL
      GROUP BY currency
      ORDER BY currency
    `,
    sql`SELECT COUNT(*)::int AS n FROM members WHERE group_id = ${group.id}`,
  ])
  const memberCount = Number(mCount?.n ?? 0)
  const activeExpenseCount = Number(counts?.active ?? 0)
  const deletedExpenseCount = Number(counts?.deleted ?? 0)
  const activeSettlementCount = Number(sCounts?.active ?? 0)
  const deletedSettlementCount = Number(sCounts?.deleted ?? 0)
  // With a search or date range the list, its page count and totals follow the matches
  const [match] = tab === 'expenses' && filtered ? await sql`
    SELECT COUNT(*) FILTER (WHERE e.deleted_at IS NULL)::int AS active,
           COUNT(*) FILTER (WHERE e.deleted_at IS NOT NULL)::int AS deleted
    FROM expenses e JOIN members m ON m.id = e.paid_by_member_id
    WHERE e.group_id = ${group.id}
      AND (${filter.from}::date IS NULL OR e.date >= ${filter.from}::date)
      AND (${filter.to}::date IS NULL OR e.date <= ${filter.to}::date)
      AND (${pattern}::text IS NULL
           OR e.description ILIKE ${pattern} ESCAPE '\\'
           OR e.category ILIKE ${pattern} ESCAPE '\\'
           OR (m.first_name || COALESCE(' ' || m.last_name, '')) ILIKE ${pattern} ESCAPE '\\')
  ` : [null]
  const matchActive = match ? Number(match.active) : activeExpenseCount
  const matchDeleted = match ? Number(match.deleted) : deletedExpenseCount
  const matchTotals = tab === 'expenses' && filtered ? await sql`
    SELECT e.currency, SUM(e.total_amount)::float AS total
    FROM expenses e JOIN members m ON m.id = e.paid_by_member_id
    WHERE e.group_id = ${group.id} AND e.deleted_at IS NULL
      AND (${filter.from}::date IS NULL OR e.date >= ${filter.from}::date)
      AND (${filter.to}::date IS NULL OR e.date <= ${filter.to}::date)
      AND (${pattern}::text IS NULL
           OR e.description ILIKE ${pattern} ESCAPE '\\'
           OR e.category ILIKE ${pattern} ESCAPE '\\'
           OR (m.first_name || COALESCE(' ' || m.last_name, '')) ILIKE ${pattern} ESCAPE '\\')
    GROUP BY e.currency ORDER BY SUM(e.total_amount) DESC
  ` : []
  const listTotal = showDeleted ? matchActive + matchDeleted : matchActive
  const page = parsePage(sp.page, listTotal)
  const pages = pageCount(listTotal)

  // Only the selected tab loads its own data
  const members = tab === 'overview' || tab === 'members'
    ? await sql`SELECT * FROM members WHERE group_id = ${group.id} ORDER BY first_name`
    : []

  const expenseRows = tab === 'expenses' ? await sql`
      SELECT
        e.id, e.description, e.total_amount, e.currency, e.date, e.category, e.created_at, e.deleted_at,
        m.first_name || COALESCE(' ' || m.last_name, '') AS paid_by_name,
        cm.first_name || COALESCE(' ' || cm.last_name, '') AS created_by_name,
        json_agg(
          json_build_object(
            'name', sm.first_name || COALESCE(' ' || sm.last_name, ''),
            'amount', es.amount::text
          ) ORDER BY sm.first_name
        ) AS splits
      FROM expenses e
      JOIN members m ON m.id = e.paid_by_member_id
      JOIN members cm ON cm.id = e.created_by_member_id
      JOIN expense_splits es ON es.expense_id = e.id
      JOIN members sm ON sm.id = es.member_id
      WHERE e.group_id = ${group.id} AND (${showDeleted}::boolean OR e.deleted_at IS NULL)
        AND (${filter.from}::date IS NULL OR e.date >= ${filter.from}::date)
        AND (${filter.to}::date IS NULL OR e.date <= ${filter.to}::date)
        AND (${pattern}::text IS NULL
             OR e.description ILIKE ${pattern} ESCAPE '\\'
             OR e.category ILIKE ${pattern} ESCAPE '\\'
             OR (m.first_name || COALESCE(' ' || m.last_name, '')) ILIKE ${pattern} ESCAPE '\\')
      GROUP BY e.id, e.description, e.total_amount, e.currency, e.date, e.category, e.created_at, e.deleted_at,
               m.first_name, m.last_name, cm.first_name, cm.last_name
      ORDER BY e.date DESC, e.created_at DESC, e.id DESC
      LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${(page - 1) * ADMIN_PAGE_SIZE}
    ` : []

  const settlementRows = tab === 'settlements' || tab === 'overview' ? await sql`
      SELECT s.id, s.from_member_id, s.to_member_id, s.amount, s.currency, s.created_at, s.deleted_at,
        fm.first_name || COALESCE(' ' || fm.last_name, '') AS from_name,
        tm.first_name || COALESCE(' ' || tm.last_name, '') AS to_name
      FROM settlements s
      JOIN members fm ON fm.id = s.from_member_id
      JOIN members tm ON tm.id = s.to_member_id
      WHERE s.group_id = ${group.id}
      ORDER BY s.created_at DESC, s.id DESC
    ` : []

  const splitRows = tab === 'overview' ? await sql`
      SELECT e.paid_by_member_id, e.currency, es.member_id, es.amount
      FROM expenses e
      JOIN expense_splits es ON es.expense_id = e.id
      WHERE e.group_id = ${group.id} AND e.deleted_at IS NULL
    ` : []

  const expenseIds = expenseRows.map(e => e.id as number)
  const loadEvents = () => sql`
    SELECT ev.expense_id, ev.type, ev.actor, ev.changes, ev.summary, ev.created_at,
           m.first_name || COALESCE(' ' || m.last_name, '') AS actor_name
    FROM expense_events ev
    LEFT JOIN members m ON m.id = ev.member_id
    WHERE ev.expense_id = ANY(${expenseIds}::int[])
    ORDER BY ev.created_at DESC, ev.id DESC
  `
  // The table is created by ensureSchema(), which normally runs when someone opens the app. If an
  // admin gets here first after a deploy, create it now instead of failing.
  const eventRows = expenseIds.length === 0 ? [] : await loadEvents().catch(async () => {
    await ensureSchema()
    return loadEvents()
  })
  const historyByExpense = new Map<number, HistoryEvent[]>()
  for (const r of eventRows) {
    const list = historyByExpense.get(r.expense_id as number) ?? []
    list.push({
      type: r.type as HistoryEvent['type'],
      actor: r.actor as HistoryEvent['actor'],
      actorName: (r.actor_name as string | null) ?? null,
      when: new Date(r.created_at as string).toISOString(),
      changes: (r.changes as Change[]) ?? [],
      summary: (r.summary as string | null) ?? null,
    })
    historyByExpense.set(r.expense_id as number, list)
  }

  const adminExpenses: AdminExpense[] = expenseRows.map(e => {
    const history = historyByExpense.get(e.id as number) ?? []
    // Expenses from before the activity log existed have no "created" entry
    if (!history.some(h => h.type === 'created')) {
      history.push({
        type: 'created', actor: 'member', actorName: (e.created_by_name as string | null) ?? null,
        when: new Date(e.created_at as string).toISOString(), changes: [], summary: null,
      })
    }
    const deleted = !!e.deleted_at
    const lastDelete = history.find(h => h.type === 'deleted')
    return {
      id: e.id as number,
      description: String(e.description),
      paidBy: String(e.paid_by_name),
      date: new Date(e.date as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      currency: String(e.currency),
      amount: Number(e.total_amount),
      category: e.category ? String(e.category) : null,
      splits: e.splits as Array<{ name: string; amount: string }>,
      deleted,
      deletedNote: deleted
        ? `Deleted${lastDelete?.actorName ? ` by ${lastDelete.actorName}` : ''}, ${new Date(e.deleted_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
        : null,
      editCount: history.filter(h => h.type === 'edited').length,
      history,
    }
  })

  async function restoreExpense(expenseId: number) {
    'use server'
    if (!(await auth())) throw new Error('Unauthorized')
    const [row] = await sql`
      SELECT id FROM expenses WHERE id = ${expenseId} AND group_id = ${group.id} AND deleted_at IS NOT NULL
    `
    if (!row) return
    await sql.transaction([
      sql`UPDATE expenses SET deleted_at = NULL WHERE id = ${expenseId}`,
      insertEvent(expenseId, null, 'restored', [], null, 'admin'),
    ])
    revalidatePath(`/admin/${group.id}`)
  }

  async function restoreSettlement(settlementId: number) {
    'use server'
    if (!(await auth())) throw new Error('Unauthorized')
    await sql`
      UPDATE settlements SET deleted_at = NULL
      WHERE id = ${settlementId} AND group_id = ${group.id} AND deleted_at IS NOT NULL
    `
    revalidatePath(`/admin/${group.id}`)
  }

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
    if (r.deleted_at) continue // deleted payments don't count towards balances
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

  // Links inside a tab keep that tab's other view options (page, deleted toggles)
  const href = (over: { page?: number; deleted?: boolean; sdeleted?: boolean }) => {
    const del = over.deleted ?? showDeleted
    const sdel = over.sdeleted ?? showDeletedSettlements
    const pg = over.page ?? page
    if (tab === 'expenses') return expensesHref(group.id as number, filter, { deleted: del, page: pg })
    const q = new URLSearchParams()
    if (tab !== 'overview') q.set('tab', tab)
    if (tab === 'settlements' && sdel) q.set('sdeleted', '1')
    const qs = q.toString()
    return `/admin/${group.id}${qs ? `?${qs}` : ''}`
  }
  const adminSettlements: AdminSettlement[] = settlementRows.map(r => ({
    id: r.id as number,
    from: String(r.from_name),
    to: String(r.to_name),
    currency: String(r.currency),
    amount: Number(r.amount),
    date: new Date(r.created_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
    deleted: !!r.deleted_at,
    deletedDate: r.deleted_at ? new Date(r.deleted_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null,
  }))

  const adminMembers: AdminMember[] = members.map(m => ({
    id: m.id as number,
    name: memberNameMap.get(m.id as number) ?? 'Unknown',
    lines: [...netByCurrency.entries()].flatMap(([currency, byMember]) => {
      const net = Math.round((byMember.get(m.id as number) ?? 0) * 100) / 100
      return Math.abs(net) > 0.005 ? [{ currency, net }] : []
    }),
  }))

  return (
    <div style={{ maxWidth: '640px', margin: '0 auto', padding: '1.25rem 1rem 2rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <Link href="/admin" style={{ fontSize: '0.875rem', color: '#2563eb', textDecoration: 'none' }}>
          ← All groups
        </Link>
        <form action={async () => {
          'use server'
          await signOut({ redirectTo: '/admin/login' })
        }}>
          <button type="submit" style={{ fontSize: '0.8125rem', color: '#6b7280', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.375rem 0.75rem', cursor: 'pointer' }}>
            Sign out
          </button>
        </form>
      </div>

      <h1 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '0.25rem' }}>
        {String(group.title)}
      </h1>
      <p style={{ color: '#6b7280', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
        {memberCount} members · {activeExpenseCount} expenses
      </p>
      <GroupTotals totals={currencyTotals.map(t => ({ currency: String(t.currency), total: Number(t.total) }))} />

      <AdminTabs groupId={group.id as number} active={tab} />

      {tab === 'overview' && (
        <Section title="Outstanding Balances">
          <AdminBalances members={adminMembers} debts={allDebts} />
        </Section>
      )}

      {tab === 'expenses' && (
        <Section>
          <ExpenseFilterBar
            groupId={group.id as number}
            filter={filter}
            showDeleted={showDeleted}
            summary={filtered
              ? `${matchActive} of ${activeExpenseCount} expense${activeExpenseCount === 1 ? '' : 's'} match${matchTotals.length ? ' · ' + matchTotals.map(t => `${t.currency} ${Number(t.total).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`).join(' + ') : ''}`
              : null}
          />
          {deletedExpenseCount > 0 && (
            <div style={{ padding: '0.5rem 1rem', borderBottom: '0.5px solid #f3f4f6' }}>
              <Link href={href({ deleted: !showDeleted, page: 1 })} style={{ fontSize: '0.8125rem', color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                {showDeleted ? 'Hide deleted' : `Show deleted (${deletedExpenseCount})`}
              </Link>
            </div>
          )}
          <ExpensesList expenses={adminExpenses} restore={restoreExpense} emptyText={filtered ? 'No expenses match.' : 'No expenses yet.'} />
          {listTotal > ADMIN_PAGE_SIZE && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', padding: '0.625rem 1rem', borderTop: '0.5px solid #f3f4f6', fontSize: '0.8125rem' }}>
              {page > 1
                ? <Link href={href({ page: page - 1 })} style={pagerLink}>← Newer</Link>
                : <span style={{ ...pagerLink, color: '#d1d5db' }}>← Newer</span>}
              <span style={{ color: '#6b7280' }}>{rangeLabel(page, listTotal)} · page {page} of {pages}</span>
              {page < pages
                ? <Link href={href({ page: page + 1 })} style={pagerLink}>Older →</Link>
                : <span style={{ ...pagerLink, color: '#d1d5db' }}>Older →</span>}
            </div>
          )}
        </Section>
      )}

      {tab === 'settlements' && (
        <Section>
          {deletedSettlementCount > 0 && (
            <div style={{ padding: '0.5rem 1rem', borderBottom: '0.5px solid #f3f4f6' }}>
              <Link href={href({ sdeleted: !showDeletedSettlements })} style={{ fontSize: '0.8125rem', color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>
                {showDeletedSettlements ? 'Hide deleted' : `Show deleted (${deletedSettlementCount})`}
              </Link>
            </div>
          )}
          <SettlementsList settlements={adminSettlements} showDeleted={showDeletedSettlements} restore={restoreSettlement} />
        </Section>
      )}

      {tab === 'members' && (
        <Section>
          {members.map((m, i) => (
            <Row key={String(m.id)} last={i === members.length - 1}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ fontWeight: 500, fontSize: '0.875rem' }}>
                  {String(m.first_name)}{m.last_name ? ` ${m.last_name}` : ''}
                </span>
                <span style={{ fontSize: '0.8125rem', color: '#6b7280', textAlign: 'right' }}>
                  {m.username ? `@${m.username}` : '—'}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.125rem' }}>
                Telegram ID {String(m.telegram_user_id)} · joined {new Date(m.created_at as string).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </div>
            </Row>
          ))}
        </Section>
      )}
    </div>
  )
}
