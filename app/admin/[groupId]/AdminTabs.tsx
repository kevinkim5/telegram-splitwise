import Link from 'next/link'

export const GROUP_TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'settlements', label: 'Settlements' },
  { key: 'members', label: 'Members' },
] as const

export type GroupTab = (typeof GROUP_TABS)[number]['key']

export function parseTab(raw: string | undefined): GroupTab {
  return GROUP_TABS.some(t => t.key === raw) ? (raw as GroupTab) : 'overview'
}

export function tabHref(groupId: number, tab: GroupTab): string {
  return tab === 'overview' ? `/admin/${groupId}` : `/admin/${groupId}?tab=${tab}`
}

const TABS_CSS = `
        .admin-tabs-wrap { position: sticky; top: 0; z-index: 10; background: #f3f4f6; margin: 0 -1rem 1rem; padding: 0.5rem 1rem; }
        .admin-tabs { display: flex; gap: 0.125rem; overflow-x: auto; scrollbar-width: none; background: #e5e7eb; border-radius: 999px; padding: 0.1875rem; }
        .admin-tabs::-webkit-scrollbar { display: none; }
        .admin-tabs a { flex: 1 1 auto; white-space: nowrap; text-align: center; text-decoration: none; font-size: 0.75rem; font-weight: 500; color: #6b7280; padding: 0.4375rem 0.3125rem; border-radius: 999px; }
        .admin-tabs a[aria-current="page"] { background: #fff; color: #111827; font-weight: 600; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
        @media (max-width: 349px) { .admin-tabs a { font-size: 0.6875rem; padding: 0.4375rem 0.25rem; } }
`

// Section tabs for one group. Plain links (each tab loads only its own data), pinned to the top of
// the page while it scrolls. Sized to stay on one row from 320px wide; if a screen is narrower
// still the row scrolls sideways instead of wrapping.
export function AdminTabs({ groupId, active }: { groupId: number; active: GroupTab }) {
  return (
    <div className="admin-tabs-wrap">
      {/* raw CSS: React would escape the quotes in a text child and break the selectors */}
      <style dangerouslySetInnerHTML={{ __html: TABS_CSS }} />
      <nav className="admin-tabs" aria-label="Group sections">
        {GROUP_TABS.map(t => (
          <Link key={t.key} href={tabHref(groupId, t.key)} aria-current={t.key === active ? 'page' : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
