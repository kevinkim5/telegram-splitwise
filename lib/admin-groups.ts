export interface AdminGroupRow {
  id: number
  title: string
  currency: string
  created_at: string
  last_activity: string
  chat_id: string // Telegram chat id; positive = a private chat with the bot, negative = a group
  member_count: number
  expense_count: number
  settlement_count: number
  is_settled: boolean
  totals: { currency: string; total: number }[] // spent per currency (active expenses)
}

export type GroupSort = 'updated' | 'name'

// A private (1:1) chat with the bot where nothing was ever recorded: somebody just opened the app.
// Telegram chat ids are positive for private chats and negative for groups and supergroups, so a
// brand new real group (negative id, no expenses yet) is never treated as noise.
export function isEmptyPrivateChat(g: Pick<AdminGroupRow, 'chat_id' | 'expense_count' | 'settlement_count'>): boolean {
  return !String(g.chat_id).startsWith('-') && g.expense_count === 0 && g.settlement_count === 0
}

// Search looks at every group, including the hidden ones (if you type a name you want to find it).
// Without a search, empty private chats are left out unless `showEmpty` is on.
export function filterSortGroups(
  rows: AdminGroupRow[],
  opts: { query: string; sort: GroupSort; showEmpty: boolean },
): AdminGroupRow[] {
  const q = opts.query.trim().toLowerCase()
  const list = rows.filter(g => {
    if (q) return g.title.toLowerCase().includes(q)
    return opts.showEmpty || !isEmptyPrivateChat(g)
  })
  return [...list].sort((a, b) =>
    opts.sort === 'name'
      ? a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id - b.id
      : new Date(b.last_activity).getTime() - new Date(a.last_activity).getTime() || b.id - a.id,
  )
}
