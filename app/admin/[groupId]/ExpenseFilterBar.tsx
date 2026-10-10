import Link from 'next/link'
import { expensesHref, isFiltered, presetLinks, todaySg, type AdminExpenseFilter } from '@/lib/admin-expense-filter'

const CSS = `
        .adm-filter { padding: 0.75rem 1rem; border-bottom: 0.5px solid #f3f4f6; display: flex; flex-direction: column; gap: 0.5rem; }
        .adm-filter form { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
        .adm-filter input { font-size: 16px; padding: 0.4375rem 0.625rem; border: 1px solid #e5e7eb; border-radius: 8px; background: #fff; color: #111827; min-width: 0; }
        .adm-filter input[type="search"] { flex: 1 1 100%; }
        .adm-filter input[type="date"] { flex: 1 1 8rem; }
        .adm-filter button { font-size: 0.875rem; font-weight: 600; color: #fff; background: #2563eb; border: 0; border-radius: 8px; padding: 0.5rem 0.875rem; cursor: pointer; }
        .adm-filter .adm-presets { display: flex; flex-wrap: wrap; gap: 0.375rem; }
        .adm-filter .adm-presets a { font-size: 0.75rem; color: #374151; background: #f3f4f6; border-radius: 999px; padding: 0.25rem 0.625rem; text-decoration: none; }
        .adm-filter .adm-presets a[aria-current="true"] { background: #2563eb; color: #fff; }
`

// Search box, From/To dates and quick ranges for the Expenses tab. A plain GET form: no client code.
export function ExpenseFilterBar({ groupId, filter, showDeleted, summary }: {
  groupId: number
  filter: AdminExpenseFilter
  showDeleted: boolean
  summary: string | null // "12 of 140 expenses · SGD 480.00" when filtered
}) {
  const filtered = isFiltered(filter)
  const today = todaySg()
  return (
    <div className="adm-filter">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <form method="get" action={`/admin/${groupId}`}>
        <input type="hidden" name="tab" value="expenses" />
        {showDeleted && <input type="hidden" name="deleted" value="1" />}
        <input type="search" name="q" defaultValue={filter.q} placeholder="Search description, category or payer" aria-label="Search expenses" maxLength={100} enterKeyHint="search" />
        <input type="date" name="from" defaultValue={filter.from ?? ''} aria-label="From date" />
        <input type="date" name="to" defaultValue={filter.to ?? ''} aria-label="To date" />
        <button type="submit">Search</button>
        {filtered && <Link href={expensesHref(groupId, { q: '', from: null, to: null }, { deleted: showDeleted })} style={{ fontSize: '0.8125rem', color: '#2563eb', fontWeight: 600, textDecoration: 'none' }}>Clear</Link>}
      </form>
      <div className="adm-presets" role="group" aria-label="Quick date ranges">
        {presetLinks(today).map(p => (
          <Link
            key={p.key}
            href={expensesHref(groupId, { q: filter.q, from: p.range.from, to: p.range.to }, { deleted: showDeleted })}
            aria-current={filter.from === p.range.from && filter.to === p.range.to ? 'true' : undefined}
          >
            {p.label}
          </Link>
        ))}
      </div>
      {filter.error && <p style={{ fontSize: '0.8125rem', color: '#dc2626', margin: 0 }}>{filter.error}. Filters were ignored.</p>}
      {summary && <p style={{ fontSize: '0.8125rem', color: '#6b7280', margin: 0 }}>{summary}</p>}
    </div>
  )
}
