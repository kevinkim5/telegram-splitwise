import { describe, expect, it } from 'vitest'
import { filterSortGroups, isEmptyPrivateChat, type AdminGroupRow } from '@/lib/admin-groups'

const g = (id: number, title: string, over: Partial<AdminGroupRow> = {}): AdminGroupRow => ({
  id, title, currency: 'SGD', created_at: '2026-01-01T00:00:00Z', last_activity: '2026-01-01T00:00:00Z',
  chat_id: String(-1000 - id), member_count: 3, expense_count: 2, settlement_count: 0, is_settled: false, ...over,
})

const rows = [
  g(1, 'Tokyo Trip', { last_activity: '2026-10-05T10:00:00Z' }),
  g(2, 'apartment', { last_activity: '2026-10-09T10:00:00Z' }),
  g(3, 'Bali', { last_activity: '2026-09-01T10:00:00Z' }),
  g(4, 'Kev', { chat_id: '99', member_count: 1, expense_count: 0, last_activity: '2026-10-10T10:00:00Z' }), // just opened the app
  g(5, 'Ann solo', { chat_id: '100', member_count: 1, expense_count: 3, last_activity: '2026-08-01T10:00:00Z' }), // private but used
  g(6, 'New group', { expense_count: 0, member_count: 2, last_activity: '2026-07-01T10:00:00Z' }), // real group, no expenses yet
]
const ids = (r: AdminGroupRow[]) => r.map(x => x.id)
const base = { query: '', sort: 'updated' as const, showEmpty: false }

describe('isEmptyPrivateChat', () => {
  it('only a private chat with nothing recorded counts', () => {
    expect(isEmptyPrivateChat(rows[3])).toBe(true)
    expect(isEmptyPrivateChat(rows[4])).toBe(false) // has expenses
    expect(isEmptyPrivateChat(rows[5])).toBe(false) // a group, even though empty
    expect(isEmptyPrivateChat({ chat_id: '99', expense_count: 0, settlement_count: 1 })).toBe(false)
  })
})

describe('filterSortGroups', () => {
  it('defaults to most recently updated first and hides empty private chats', () => {
    expect(ids(filterSortGroups(rows, base))).toEqual([2, 1, 3, 5, 6])
  })

  it('can show the hidden ones too', () => {
    expect(ids(filterSortGroups(rows, { ...base, showEmpty: true }))).toEqual([4, 2, 1, 3, 5, 6])
  })

  it('sorts by name, ignoring case', () => {
    expect(ids(filterSortGroups(rows, { ...base, sort: 'name' }))).toEqual([5, 2, 3, 6, 1])
  })

  it('searches the group name, case-insensitively, as a substring', () => {
    expect(ids(filterSortGroups(rows, { ...base, query: 'TRIP' }))).toEqual([1])
    expect(ids(filterSortGroups(rows, { ...base, query: ' a' }))).toEqual([2, 3, 5]) // "apartment", "Bali", "Ann solo"... trimmed → 'a'
  })

  it('search also finds hidden groups', () => {
    expect(ids(filterSortGroups(rows, { ...base, query: 'kev' }))).toEqual([4])
  })

  it('search results keep the chosen sort', () => {
    expect(ids(filterSortGroups(rows, { ...base, query: 'a', sort: 'name' }))).toEqual([5, 2, 3])
  })

  it('returns nothing for no match and does not change the input', () => {
    const copy = [...rows]
    expect(filterSortGroups(rows, { ...base, query: 'zzz' })).toEqual([])
    expect(rows).toEqual(copy)
  })
})
