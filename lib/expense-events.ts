import { sql } from '@/lib/sql'
import type { Change } from '@/lib/expense-history'

export type EventType = 'created' | 'edited' | 'deleted' | 'restored'

export interface ActivityEvent {
  id: number | null
  type: EventType
  actor: 'member' | 'admin'
  actor_name: string | null
  created_at: string
  changes: Change[]
  summary: string | null
}

// Build an INSERT to run inside sql.transaction([...]) or on its own.
export function insertEvent(
  expenseId: number,
  memberId: number | null,
  type: EventType,
  changes: Change[] = [],
  summary: string | null = null,
  actor: 'member' | 'admin' = 'member',
) {
  return sql`
    INSERT INTO expense_events (expense_id, member_id, actor, type, changes, summary)
    VALUES (${expenseId}, ${memberId}, ${actor}, ${type}, ${JSON.stringify(changes)}::jsonb, ${summary})
  `
}

// Receipt photos are uploaded in a separate request right after the expense is saved. Fold that
// into the edit the same person just made (within a couple of minutes) so one save reads as one entry.
export async function logReceiptChange(expenseId: number, memberId: number, what: 'added' | 'replaced' | 'removed') {
  const change: Change = { field: 'receipt', to: what }
  const [recent] = await sql`
    SELECT id FROM expense_events
    WHERE expense_id = ${expenseId} AND member_id = ${memberId} AND actor = 'member' AND type = 'edited'
      AND created_at > NOW() - INTERVAL '2 minutes'
    ORDER BY created_at DESC LIMIT 1
  `
  if (recent) {
    await sql`
      UPDATE expense_events SET changes = changes || ${JSON.stringify([change])}::jsonb
      WHERE id = ${recent.id}
    `
  } else {
    await insertEvent(expenseId, memberId, 'edited', [change])
  }
}

// Newest first. Always ends with a "created" entry, synthesised for older expenses.
export async function loadActivity(expenseId: number): Promise<ActivityEvent[]> {
  const [rows, [exp]] = await Promise.all([
    sql`
      SELECT ev.id, ev.type, ev.actor, ev.changes, ev.summary, ev.created_at,
             m.first_name || COALESCE(' ' || m.last_name, '') AS actor_name
      FROM expense_events ev
      LEFT JOIN members m ON m.id = ev.member_id
      WHERE ev.expense_id = ${expenseId}
      ORDER BY ev.created_at DESC, ev.id DESC
    `,
    sql`
      SELECT e.created_at, m.first_name || COALESCE(' ' || m.last_name, '') AS actor_name
      FROM expenses e
      LEFT JOIN members m ON m.id = e.created_by_member_id
      WHERE e.id = ${expenseId}
    `,
  ])
  const events: ActivityEvent[] = rows.map(r => ({
    id: r.id as number,
    type: r.type as EventType,
    actor: r.actor as 'member' | 'admin',
    actor_name: (r.actor_name as string | null) ?? null,
    created_at: new Date(r.created_at as string).toISOString(),
    changes: (r.changes as Change[]) ?? [],
    summary: (r.summary as string | null) ?? null,
  }))
  if (exp?.created_at && !events.some(e => e.type === 'created')) {
    events.push({
      id: null, type: 'created', actor: 'member',
      actor_name: (exp.actor_name as string | null) ?? null,
      created_at: new Date(exp.created_at as string).toISOString(),
      changes: [], summary: null,
    })
  }
  return events
}

export async function loadMemberNames(groupId: number): Promise<Map<number, string>> {
  const rows = await sql`SELECT id, first_name, last_name FROM members WHERE group_id = ${groupId}`
  return new Map(rows.map(r => [
    r.id as number,
    `${r.first_name}${r.last_name ? ' ' + r.last_name : ''}`,
  ]))
}
