'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArchiveButton } from './ArchiveButton'
import { filterSortGroups, isEmptyPrivateChat, type AdminGroupRow, type GroupSort } from '@/lib/admin-groups'

const dateFmt = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

export function GroupsList({ groups, archive }: { groups: AdminGroupRow[]; archive: (id: number) => Promise<void> }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<GroupSort>('updated')
  const [showEmpty, setShowEmpty] = useState(false)

  const hiddenCount = groups.filter(isEmptyPrivateChat).length
  const shown = filterSortGroups(groups, { query, sort, showEmpty })

  return (
    <>
      {/* Search + sort */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.625rem' }}>
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search groups"
          aria-label="Search groups by name"
          style={{ flex: 1, minWidth: 0, fontSize: '0.875rem', padding: '0.5rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '10px', background: '#fff', outline: 'none' }}
        />
        <button
          type="button"
          onClick={() => setSort(s => (s === 'updated' ? 'name' : 'updated'))}
          aria-label={sort === 'updated' ? 'Sorted by last updated. Switch to name' : 'Sorted by name. Switch to last updated'}
          style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '10px', padding: '0 0.75rem', cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          {sort === 'updated' ? '↓ Last updated' : 'A–Z Name'}
        </button>
      </div>

      {hiddenCount > 0 && (
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: '#6b7280', marginBottom: '0.75rem', cursor: 'pointer', paddingLeft: '0.25rem' }}>
          <input type="checkbox" checked={showEmpty} onChange={e => setShowEmpty(e.target.checked)} />
          Show {hiddenCount} private chat{hiddenCount === 1 ? '' : 's'} with no activity (someone just opened the app)
        </label>
      )}

      {shown.length === 0 && (
        <p style={{ color: '#6b7280', fontSize: '0.875rem', padding: '1rem 0.25rem' }}>
          {query.trim() ? `No groups match “${query.trim()}”.` : 'No groups yet.'}
        </p>
      )}

      {/* Group cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
        {shown.map(g => (
          <div key={g.id} style={{ display: 'flex', alignItems: 'stretch', gap: '0.5rem' }}>
            <Link href={`/admin/${g.id}`} style={{ textDecoration: 'none', color: 'inherit', flex: 1, minWidth: 0 }}>
              <div style={{ background: '#fff', borderRadius: '14px', padding: '1rem 1.125rem', boxShadow: '0 1px 3px rgba(0,0,0,0.07)', height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.375rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9375rem', color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.title}</span>
                  <span style={{
                    fontSize: '0.6875rem', fontWeight: 600, borderRadius: '999px', padding: '0.1875rem 0.625rem', flexShrink: 0, marginLeft: '0.75rem',
                    color: g.is_settled ? '#16a34a' : '#dc2626', background: g.is_settled ? '#f0fdf4' : '#fef2f2',
                  }}>
                    {g.is_settled ? 'Settled' : 'Outstanding'}
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563eb', background: '#eff6ff', borderRadius: '6px', padding: '0.125rem 0.5rem' }}>{g.currency}</span>
                  {!String(g.chat_id).startsWith('-') ? (
                    <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#6b7280', background: '#f3f4f6', borderRadius: '6px', padding: '0.125rem 0.5rem' }}>Private chat</span>
                  ) : null}
                  <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>
                    Updated {dateFmt(g.last_activity)} · created {dateFmt(g.created_at)}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {[
                    { label: 'members', value: g.member_count },
                    { label: 'expenses', value: g.expense_count },
                    { label: 'settlements', value: g.settlement_count },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ flex: 1, background: '#f9fafb', borderRadius: '8px', padding: '0.4375rem 0.625rem' }}>
                      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', lineHeight: 1.2 }}>{value}</div>
                      <div style={{ fontSize: '0.6875rem', color: '#9ca3af', marginTop: '0.125rem' }}>{label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Link>

            <form action={() => archive(g.id)} style={{ display: 'flex' }}>
              <ArchiveButton groupTitle={g.title} />
            </form>
          </div>
        ))}
      </div>
    </>
  )
}
