import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))

import { sql } from '@/lib/sql'
import { loadActivity, logReceiptChange } from '@/lib/expense-events'

const mockSql = vi.mocked(sql)
let calls: { q: string; vals: unknown[] }[]
let recent: unknown[]
let eventRows: unknown[]
let created: unknown[]

beforeEach(() => {
  vi.clearAllMocks()
  calls = []
  recent = []
  eventRows = []
  created = [{ created_at: '2026-10-01T05:41:00.000Z', actor_name: 'Kev' }]
  mockSql.mockImplementation(((strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim()
    calls.push({ q, vals })
    if (/^SELECT id FROM expense_events/.test(q)) return Promise.resolve(recent)
    if (/^SELECT ev\.id/.test(q)) return Promise.resolve(eventRows)
    if (/^SELECT e\.created_at/.test(q)) return Promise.resolve(created)
    return Promise.resolve([])
  }) as never)
})

describe('loadActivity', () => {
  it('synthesises a "created" entry for expenses that predate the log, always last', async () => {
    eventRows = [{ id: 2, type: 'edited', actor: 'member', actor_name: 'Ann', created_at: '2026-10-02T05:00:00.000Z', changes: [{ field: 'receipt', to: 'added' }], summary: null }]
    const events = await loadActivity(40)
    expect(events.map(e => e.type)).toEqual(['edited', 'created'])
    expect(events[1]).toMatchObject({ actor_name: 'Kev', id: null, created_at: '2026-10-01T05:41:00.000Z' })
  })

  it('does not add a second "created" entry when one is stored', async () => {
    eventRows = [{ id: 1, type: 'created', actor: 'member', actor_name: 'Kev', created_at: '2026-10-01T05:41:00.000Z', changes: [], summary: 'SGD 5.00 · paid by Kev · split equally between 2' }]
    const events = await loadActivity(40)
    expect(events).toHaveLength(1)
    expect(events[0].summary).toContain('SGD 5.00')
  })

  it('keeps deleted and restored entries, and marks admin actions', async () => {
    eventRows = [
      { id: 4, type: 'restored', actor: 'admin', actor_name: null, created_at: '2026-10-03T05:00:00.000Z', changes: [], summary: null },
      { id: 3, type: 'deleted', actor: 'member', actor_name: 'Ann', created_at: '2026-10-02T05:00:00.000Z', changes: [], summary: null },
    ]
    const events = await loadActivity(40)
    expect(events.map(e => [e.type, e.actor])).toEqual([['restored', 'admin'], ['deleted', 'member'], ['created', 'member']])
  })
})

describe('logReceiptChange', () => {
  it('folds into the same person\'s edit from the last two minutes', async () => {
    recent = [{ id: 11 }]
    await logReceiptChange(40, 7, 'added')
    expect(calls.some(c => /^UPDATE expense_events SET changes = changes \|\|/.test(c.q))).toBe(true)
    expect(calls.some(c => /^INSERT INTO expense_events/.test(c.q))).toBe(false)
    expect(JSON.parse(calls.find(c => /^UPDATE/.test(c.q))!.vals[0] as string)).toEqual([{ field: 'receipt', to: 'added' }])
  })

  it('starts its own entry when there is no recent edit by that person', async () => {
    await logReceiptChange(40, 7, 'removed')
    const insert = calls.find(c => /^INSERT INTO expense_events/.test(c.q))!
    expect(insert.vals.slice(0, 4)).toEqual([40, 7, 'member', 'edited'])
    expect(JSON.parse(insert.vals[4] as string)).toEqual([{ field: 'receipt', to: 'removed' }])
  })
})
