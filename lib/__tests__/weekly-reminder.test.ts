import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/db', () => ({ ensureSchema: vi.fn() }))
vi.mock('@/lib/group-member', () => ({ getGroupMember: vi.fn() }))
vi.mock('@/lib/group-debts', () => ({ loadSimplifiedDebts: vi.fn() }))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { loadSimplifiedDebts } from '@/lib/group-debts'
import { describeReminderResult, failedResult, isReminderDay, singaporeToday } from '../reminder'
import { settingsBodySchema } from '../schemas'
import { GET as cronGET } from '../../app/api/cron/balance-reminders/route'
import { GET as settingsGET, PUT as settingsPUT } from '../../app/api/groups/[chatId]/settings/route'
import type { SimplifiedDebt } from '@/types'

const mockSql = vi.mocked(sql)

describe('singaporeToday', () => {
  it('is the Singapore calendar day and weekday, not UTC', () => {
    // Sunday 11 Oct 2026 20:00 UTC is already Monday 12 Oct 04:00 in Singapore
    expect(singaporeToday(new Date('2026-10-11T20:00:00Z'))).toEqual({ date: '2026-10-12', day: 1 })
    expect(singaporeToday(new Date('2026-10-11T01:00:00Z'))).toEqual({ date: '2026-10-11', day: 0 }) // the cron time, 9 am Sunday
    expect(singaporeToday(new Date('2026-10-17T16:30:00Z'))).toEqual({ date: '2026-10-18', day: 0 }) // Saturday UTC evening = Sunday
  })
  it('weekday numbers run Sunday 0 to Saturday 6', () => {
    const days = [0, 1, 2, 3, 4, 5, 6].map(i => singaporeToday(new Date(Date.UTC(2026, 9, 11 + i, 4))).day)
    expect(days).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
  it('isReminderDay accepts 0-6 only', () => {
    for (const ok of [0, 3, 6]) expect(isReminderDay(ok)).toBe(true)
    for (const bad of [-1, 7, 1.5, NaN, '3', null, undefined]) expect(isReminderDay(bad)).toBe(false)
  })
})

describe('reminder result text', () => {
  it('describes posted / skipped / failed, and nothing for an empty or unknown value', () => {
    expect(describeReminderResult('posted')).toEqual({ tone: 'ok', text: 'posted in the group' })
    expect(describeReminderResult('settled')).toEqual({ tone: 'info', text: 'skipped, everyone was settled up' })
    expect(describeReminderResult('failed: Forbidden: bot was kicked')).toEqual({ tone: 'error', text: "couldn't post (Forbidden: bot was kicked)" })
    expect(describeReminderResult(null)).toBeNull()
    expect(describeReminderResult('')).toBeNull()
    expect(describeReminderResult('something else')).toBeNull()
  })
  it('failedResult flattens whitespace and caps the length', () => {
    expect(failedResult('a\n  b   c')).toBe('failed: a b c')
    expect(failedResult('x'.repeat(500)).length).toBe('failed: '.length + 140)
  })
})

describe('settingsBodySchema', () => {
  it('currency and reminder_day can be sent alone or together; null turns the reminder off', () => {
    expect(settingsBodySchema.safeParse({ currency: 'SGD' }).success).toBe(true)
    expect(settingsBodySchema.safeParse({ reminder_day: 3 }).success).toBe(true)
    expect(settingsBodySchema.safeParse({ reminder_day: null }).success).toBe(true)
    expect(settingsBodySchema.safeParse({ currency: 'USD', reminder_day: 0 }).success).toBe(true)
  })
  it('rejects an empty body, a bad currency, and a day outside 0-6', () => {
    expect(settingsBodySchema.safeParse({}).success).toBe(false)
    expect(settingsBodySchema.safeParse({ currency: 'sgd' }).success).toBe(false)
    expect(settingsBodySchema.safeParse({ reminder_day: 7 }).success).toBe(false)
    expect(settingsBodySchema.safeParse({ reminder_day: -1 }).success).toBe(false)
    expect(settingsBodySchema.safeParse({ reminder_day: 2.5 }).success).toBe(false)
    expect(settingsBodySchema.safeParse({ reminder_day: 'Monday' }).success).toBe(false)
  })
})

// ── settings route ──
describe('settings: weekly reminder', () => {
  const props = { params: Promise.resolve({ chatId: '-100123' }) }
  let updates: { text: string; vals: unknown[] }[]
  let stored: { reminder_day: number | null; set_by: string | null }

  beforeEach(() => {
    vi.clearAllMocks()
    updates = []
    stored = { reminder_day: null, set_by: null }
    vi.mocked(getAuthUser).mockReturnValue({ id: 99, first_name: 'Kev' } as never)
    vi.mocked(getGroupMember).mockResolvedValue({ id: 7 })
    mockSql.mockImplementation(((strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join('?').replace(/\s+/g, ' ').trim()
      if (/^SELECT id.* FROM groups WHERE chat_id/.test(q)) return Promise.resolve([{ id: 5, title: 'Trip', currency: 'SGD' }])
      if (/^UPDATE groups SET reminder_day/.test(q)) {
        updates.push({ text: q, vals })
        stored = { reminder_day: vals[0] as number | null, set_by: vals[1] === null ? null : 'Kev' }
        return Promise.resolve([])
      }
      if (/^UPDATE groups SET currency/.test(q)) { updates.push({ text: q, vals }); return Promise.resolve([]) }
      if (/FROM groups g LEFT JOIN members m ON m.id = g.reminder_set_by/.test(q)) return Promise.resolve([stored])
      if (/^SELECT id, title, currency FROM groups WHERE id/.test(q)) return Promise.resolve([{ id: 5, title: 'Trip', currency: 'SGD' }])
      return Promise.resolve([])
    }) as never)
  })

  const put = (body: unknown) => settingsPUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }), props)

  it('GET returns the reminder day and who set it (null when off)', async () => {
    expect(await (await settingsGET(new Request('http://x'), props)).json()).toEqual({
      currency: 'SGD', title: 'Trip', reminder_day: null, reminder_set_by: null, reminder_last_run_at: null, reminder_last_result: null,
    })
    stored = { reminder_day: 3, set_by: 'Ann Lee' }
    expect(await (await settingsGET(new Request('http://x'), props)).json()).toMatchObject({ reminder_day: 3, reminder_set_by: 'Ann Lee' })
  })

  it('GET also returns what the last scheduled reminder did (time as ISO, result text)', async () => {
    stored = { reminder_day: 2, set_by: 'Kev', reminder_last_run_at: new Date('2026-10-20T01:01:02Z'), reminder_last_result: 'failed: Forbidden: bot was kicked' } as never
    expect(await (await settingsGET(new Request('http://x'), props)).json()).toMatchObject({
      reminder_last_run_at: '2026-10-20T01:01:02.000Z', reminder_last_result: 'failed: Forbidden: bot was kicked',
    })
  })

  it('setting a day saves it with the member who set it, and does not touch the currency', async () => {
    const res = await put({ reminder_day: 5 })
    expect(res.status).toBe(200)
    expect(updates).toHaveLength(1)
    expect(updates[0].text).toMatch(/^UPDATE groups SET reminder_day = \?, reminder_set_by = \? WHERE id = \?$/)
    expect(updates[0].vals).toEqual([5, 7, 5]) // day, member id 7, group id 5
    expect(await res.json()).toMatchObject({ currency: 'SGD', reminder_day: 5, reminder_set_by: 'Kev' })
  })

  it('Sunday (0) is a real day, not "off"', async () => {
    await put({ reminder_day: 0 })
    expect(updates[0].vals[0]).toBe(0)
    expect(updates[0].vals[1]).toBe(7)
  })

  it('null turns it off and clears who set it', async () => {
    const res = await put({ reminder_day: null })
    expect(updates[0].vals).toEqual([null, null, 5])
    expect(await res.json()).toMatchObject({ reminder_day: null, reminder_set_by: null })
  })

  it('currency alone still works and leaves the reminder untouched', async () => {
    await put({ currency: 'USD' })
    expect(updates).toHaveLength(1)
    expect(updates[0].text).toMatch(/^UPDATE groups SET currency/)
  })

  it('422 for a bad day or an empty body, with nothing saved', async () => {
    expect((await put({ reminder_day: 9 })).status).toBe(422)
    expect((await put({})).status).toBe(422)
    expect(updates).toHaveLength(0)
  })

  it('403 for a non-member: nothing saved', async () => {
    vi.mocked(getGroupMember).mockResolvedValue(null)
    expect((await put({ reminder_day: 2 })).status).toBe(403)
    expect(updates).toHaveLength(0)
  })
})

// ── the daily cron ──
describe('GET /api/cron/balance-reminders', () => {
  let claimed: { id: number; chat_id: string; title: string }[]
  let claimSql: { text: string; vals: unknown[] }[]
  let released: unknown[][]
  let recorded: { id: unknown; result: unknown }[]
  let recordFails: boolean
  let tgSent: { chat_id: string; text: string }[]
  let tgFail: Set<string>
  let debts: SimplifiedDebt[]
  const debt = (from: number, to: number, amount: number): SimplifiedDebt => ({ from_member_id: from, from_name: 'A', to_member_id: to, to_name: 'B', amount, currency: 'SGD' })

  const req = (qs = '', auth: string | null = 'Bearer s3cret') =>
    new Request('http://x/api/cron/balance-reminders' + qs, { headers: auth ? { authorization: auth } : {} })

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.CRON_SECRET = 's3cret'
    process.env.BOT_TOKEN = 'T'
    claimed = [{ id: 5, chat_id: '-100123', title: 'Tokyo' }, { id: 6, chat_id: '-100456', title: 'Bali' }]
    claimSql = []; released = []; recorded = []; recordFails = false; tgSent = []; tgFail = new Set()
    debts = [debt(7, 8, 12)]
    vi.mocked(loadSimplifiedDebts).mockImplementation(async () => debts)
    mockSql.mockImplementation(((strings: TemplateStringsArray, ...vals: unknown[]) => {
      const q = strings.join('?').replace(/\s+/g, ' ').trim()
      if (/^UPDATE groups SET reminder_last_sent_on = \?::date WHERE/.test(q)) { claimSql.push({ text: q, vals }); return Promise.resolve(claimed) }
      if (/^UPDATE groups SET reminder_last_run_at = NOW\(\), reminder_last_result = \? WHERE id = \?$/.test(q)) {
        if (recordFails) return Promise.reject(new Error('db down'))
        recorded.push({ id: vals[1], result: vals[0] }); return Promise.resolve([])
      }
      if (/^UPDATE groups SET reminder_last_sent_on = NULL/.test(q)) { released.push(vals); return Promise.resolve([]) }
      if (/^SELECT id, title FROM groups WHERE reminder_day/.test(q)) { claimSql.push({ text: q, vals }); return Promise.resolve(claimed.map(({ id, title }) => ({ id, title }))) }
      if (/^SELECT id, first_name, last_name, username FROM members/.test(q)) return Promise.resolve([{ id: 7, first_name: 'Kev', username: 'kev' }, { id: 8, first_name: 'Ann', username: null }])
      return Promise.resolve([])
    }) as never)
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body))
      if (tgFail.has(body.chat_id)) return new Response(JSON.stringify({ ok: false, description: 'Forbidden: bot was kicked' }), { status: 403 })
      tgSent.push(body)
      return new Response(JSON.stringify({ ok: true }))
    }))
  })
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.CRON_SECRET })

  it('makes sure the schema exists before reading the reminder columns (first run after a deploy)', async () => {
    const { ensureSchema } = await import('@/lib/db')
    await cronGET(req('?day=1&dry=1'))
    expect(ensureSchema).toHaveBeenCalledTimes(1)
    vi.mocked(ensureSchema).mockClear()
    await cronGET(req('?day=1', null)) // unauthorised: never touches the database
    expect(ensureSchema).not.toHaveBeenCalled()
  })

  it('refuses to run without CRON_SECRET configured, and without the right secret', async () => {
    delete process.env.CRON_SECRET
    expect((await cronGET(req())).status).toBe(500)
    process.env.CRON_SECRET = 's3cret'
    expect((await cronGET(req('', null))).status).toBe(401)
    expect((await cronGET(req('', 'Bearer wrong!'))).status).toBe(401)
    expect((await cronGET(req('', 's3cret'))).status).toBe(401) // needs the Bearer prefix
    expect(tgSent).toHaveLength(0)
    expect(claimSql).toHaveLength(0) // nothing even queried
  })

  it('posts the balances in every group due today, each to its own chat', async () => {
    const res = await cronGET(req('?day=1'))
    expect(await res.json()).toMatchObject({ day: 1, due: 2, sent: 2, settled: 0, failed: [] })
    expect(tgSent.map(s => s.chat_id).sort()).toEqual(['-100123', '-100456'])
    expect(tgSent[0].text).toContain('outstanding balances')
  })

  it('claims the groups for today in one statement (day, not deleted, not already sent today)', async () => {
    await cronGET(req('?day=1'))
    expect(claimSql).toHaveLength(1)
    expect(claimSql[0].text).toMatch(/WHERE reminder_day = \? AND deleted_at IS NULL AND reminder_last_sent_on IS DISTINCT FROM \?::date RETURNING id, chat_id, title/)
    expect(claimSql[0].vals[1]).toBe(1)
    expect(claimSql[0].vals[0]).toBe(claimSql[0].vals[2]) // the same date is stamped and compared
  })

  it('a second run the same day finds nothing to claim and sends nothing', async () => {
    claimed = []
    expect(await (await cronGET(req('?day=1'))).json()).toMatchObject({ due: 0, sent: 0 })
    expect(tgSent).toHaveLength(0)
  })

  it('a group that is all settled up is skipped quietly, and stays claimed for today', async () => {
    debts = []
    expect(await (await cronGET(req('?day=1'))).json()).toMatchObject({ due: 2, sent: 0, settled: 2, failed: [] })
    expect(tgSent).toHaveLength(0)
    expect(released).toHaveLength(0)
  })

  it('one group failing does not stop the others, and its claim is released so it can be retried', async () => {
    tgFail.add('-100123')
    const body = await (await cronGET(req('?day=1'))).json()
    expect(body).toMatchObject({ due: 2, sent: 1, failed: [5] })
    expect(tgSent.map(s => s.chat_id)).toEqual(['-100456'])
    expect(released).toHaveLength(1)
    expect(released[0][0]).toBe(5)
  })

  it('records what happened for each group: posted, skipped because settled, or failed with Telegram\'s reason', async () => {
    tgFail.add('-100123')
    await cronGET(req('?day=1'))
    const by = Object.fromEntries(recorded.map(r => [String(r.id), r.result]))
    expect(by['5']).toBe('failed: Forbidden: bot was kicked')
    expect(by['6']).toBe('posted')
    recorded.length = 0; tgFail.clear(); debts = []
    await cronGET(req('?day=1'))
    expect(recorded.map(r => r.result)).toEqual(['settled', 'settled'])
  })

  it('a failure that is not from Telegram (e.g. the database) is recorded too', async () => {
    vi.mocked(loadSimplifiedDebts).mockRejectedValue(new Error('connection reset'))
    await cronGET(req('?day=1'))
    expect(recorded.map(r => r.result)).toEqual(['failed: connection reset', 'failed: connection reset'])
  })

  it('if recording the result fails the run still completes and reports normally', async () => {
    recordFails = true
    const res = await cronGET(req('?day=1'))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ due: 2, sent: 2, failed: [] })
  })

  it('?dry=1 lists the groups that are due and sends and changes nothing', async () => {
    const body = await (await cronGET(req('?day=1&dry=1'))).json()
    expect(body).toEqual({ dry: true, day: 1, date: expect.any(String), due: [{ id: 5, title: 'Tokyo' }, { id: 6, title: 'Bali' }] })
    expect(tgSent).toHaveLength(0)
    expect(claimSql[0].text).toMatch(/^SELECT/)
  })

  it('rejects a day outside 0-6', async () => {
    expect((await cronGET(req('?day=9'))).status).toBe(400)
    expect((await cronGET(req('?day=abc'))).status).toBe(400)
  })

  it('defaults to today in Singapore', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-11T01:00:00Z')) // Sunday 9 am Singapore
    try {
      const body = await (await cronGET(req())).json()
      expect(body).toMatchObject({ day: 0, date: '2026-10-11' })
    } finally { vi.useRealTimers() }
  })
})
