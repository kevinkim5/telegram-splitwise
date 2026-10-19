import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => { process.env.BOT_TOKEN = 'T'; process.env.TELEGRAM_APP_URL = 'https://t.me/bot/split' })

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/group-member', () => ({ getGroupMember: vi.fn() }))
vi.mock('@/lib/group-debts', () => ({ loadSimplifiedDebts: vi.fn() }))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { loadSimplifiedDebts } from '@/lib/group-debts'
import { buildNotifyMessage, buildPrivateMessages } from '@/lib/notify-message'
import { classifyTelegramFailure, sendTelegramMessage } from '@/lib/telegram-send'
import { POST } from '../../app/api/groups/[chatId]/notify-private/route'
import type { SimplifiedDebt } from '@/types'

const names: Record<number, string> = { 7: '@kev', 8: '@ann', 9: 'Ben', 10: 'Cai' }
const display = (id: number) => names[id] ?? 'Unknown'
const debt = (from: number, to: number, amount: number, currency: string): SimplifiedDebt => ({
  from_member_id: from, from_name: names[from], to_member_id: to, to_name: names[to], amount, currency,
})
const RATES = { JPY: 0.0091, USD: 1.34, THB: 0.04 }

describe('buildPrivateMessages', () => {
  const debts = [debt(7, 8, 3000, 'JPY'), debt(7, 8, 18.5, 'USD'), debt(7, 9, 12, 'USD'), debt(10, 7, 250, 'THB')]

  it('one message per person who owes, listing only what they owe; people only owed get none', () => {
    const m = buildPrivateMessages('Tokyo Trip', debts, display, RATES)
    expect([...m.keys()].sort((a, b) => a - b)).toEqual([7, 10])
    expect(m.get(7)).toBe([
      '💰 <b>Tokyo Trip</b>',
      'You owe:',
      '  • @ann  ≈ SGD 52.09 (JPY 3000.00 + USD 18.50)',
      '  • Ben  ≈ SGD 16.08 (USD 12.00)',
    ].join('\n'))
    expect(m.get(10)).toBe(['💰 <b>Tokyo Trip</b>', 'You owe:', '  • @kev  ≈ SGD 10.00 (THB 250.00)'].join('\n'))
  })

  it('never mentions other people\'s debts (privacy)', () => {
    const m = buildPrivateMessages('Trip', debts, display, RATES)
    expect(m.get(10)).not.toContain('Ben')
    expect(m.get(10)).not.toContain('@ann')
    expect(m.get(7)).not.toContain('Cai')
  })

  it('uses the same amount rules as the group message: SGD-only plain, no rates = originals, never a partial total', () => {
    expect(buildPrivateMessages('T', [debt(7, 8, 12, 'SGD')], display, RATES).get(7)).toContain('  • @ann  SGD 12.00')
    expect(buildPrivateMessages('T', [debt(7, 8, 12, 'USD')], display, null).get(7)).toContain('  • @ann  USD 12.00')
    const partial = buildPrivateMessages('T', [debt(7, 8, 3000, 'JPY'), debt(7, 8, 18.5, 'USD')], display, { JPY: 0.0091 }).get(7)!
    expect(partial).toContain('  • @ann  JPY 3000.00 + USD 18.50')
    expect(partial).not.toContain('≈')
  })

  it('escapes the group title for Telegram HTML', () => {
    expect(buildPrivateMessages('A & <B>', [debt(7, 8, 1, 'SGD')], display, null).get(7)).toContain('<b>A &amp; &lt;B&gt;</b>')
  })

  it('no debts: no messages', () => {
    expect(buildPrivateMessages('T', [], display, null).size).toBe(0)
  })

  it('the group message is unchanged by sharing code with it', () => {
    expect(buildNotifyMessage('Tokyo Trip', debts, display, RATES)).toBe([
      '💰 <b>Tokyo Trip</b> — outstanding balances',
      '',
      '<b>@kev</b> owes:',
      '  • @ann  ≈ SGD 52.09 (JPY 3000.00 + USD 18.50)',
      '  • Ben  ≈ SGD 16.08 (USD 12.00)',
      '',
      '<b>Cai</b> owes:',
      '  • @kev  ≈ SGD 10.00 (THB 250.00)',
    ].join('\n'))
  })
})

describe('classifyTelegramFailure', () => {
  it('403 (never started the bot / blocked it) is unreachable', () => {
    expect(classifyTelegramFailure(403, { error_code: 403, description: "Forbidden: bot can't initiate conversation with a user" })).toBe('unreachable')
    expect(classifyTelegramFailure(403, { error_code: 403, description: 'Forbidden: bot was blocked by the user' })).toBe('unreachable')
    expect(classifyTelegramFailure(403, null)).toBe('unreachable')
  })
  it('"chat not found" is unreachable; other 400s, 429 and 5xx are real failures', () => {
    expect(classifyTelegramFailure(400, { error_code: 400, description: 'Bad Request: chat not found' })).toBe('unreachable')
    expect(classifyTelegramFailure(400, { error_code: 400, description: "Bad Request: can't parse entities" })).toBe('failed')
    expect(classifyTelegramFailure(429, { error_code: 429, description: 'Too Many Requests: retry after 5' })).toBe('failed')
    expect(classifyTelegramFailure(502, null)).toBe('failed')
  })
})

describe('sendTelegramMessage', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('ok on a delivered message; sends HTML to the given chat', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true, result: {} })))
    vi.stubGlobal('fetch', f)
    expect(await sendTelegramMessage('T', '123', 'hi')).toEqual({ ok: true })
    expect(f.mock.calls[0][0]).toBe('https://api.telegram.org/botT/sendMessage')
    expect(JSON.parse(f.mock.calls[0][1].body)).toEqual({ chat_id: '123', text: 'hi', parse_mode: 'HTML' })
  })
  it('a network error or timeout is a failure, not a throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    expect(await sendTelegramMessage('T', '1', 'x')).toMatchObject({ ok: false, kind: 'failed' })
  })
  it('a non-JSON error body still classifies by status', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html>', { status: 403 })))
    expect(await sendTelegramMessage('T', '1', 'x')).toMatchObject({ ok: false, kind: 'unreachable' })
  })
})

// ── the route ──
const mockSql = vi.mocked(sql)
const props = { params: Promise.resolve({ chatId: '-100123' }) }
const MEMBERS = [
  { id: 7, first_name: 'Kev', last_name: null, username: 'kev', telegram_user_id: '99' },
  { id: 8, first_name: 'Ann', last_name: null, username: 'ann', telegram_user_id: '100' },
  { id: 9, first_name: 'Ben', last_name: 'Tan', username: null, telegram_user_id: '101' },
  { id: 10, first_name: 'Cai', last_name: null, username: null, telegram_user_id: '102' },
]

describe('POST /notify-private', () => {
  let sent: { chat_id: string; text: string; reply_markup?: unknown }[]
  let tgReply: (chatId: string) => Response

  beforeEach(() => {
    vi.clearAllMocks()
    sent = []
    vi.mocked(getAuthUser).mockReturnValue({ id: 99, first_name: 'Kev' } as never)
    vi.mocked(getGroupMember).mockResolvedValue({ id: 7 })
    vi.mocked(loadSimplifiedDebts).mockResolvedValue([debt(7, 8, 3000, 'JPY'), debt(7, 8, 18.5, 'USD'), debt(10, 7, 20, 'SGD')])
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const q = strings.join('?').replace(/\s+/g, ' ').trim()
      if (/^SELECT id, title FROM groups/.test(q)) return Promise.resolve([{ id: 5, title: 'Tokyo Trip' }])
      if (/^SELECT id, first_name, last_name, username, telegram_user_id FROM members/.test(q)) return Promise.resolve(MEMBERS)
      return Promise.resolve([])
    }) as never)
    tgReply = () => new Response(JSON.stringify({ ok: true, result: {} }))
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('frankfurter')) {
        return new Response(JSON.stringify({ base: 'EUR', date: '2026-10-05', rates: { JPY: 164.835, USD: 1.119, SGD: 1.5 } }))
      }
      const body = JSON.parse(String(init?.body))
      sent.push(body)
      return tgReply(String(body.chat_id))
    }))
  })
  afterEach(() => vi.unstubAllGlobals())

  const call = () => POST(new Request('http://x', { method: 'POST' }), props)

  it('DMs each person who owes, at their own Telegram id, and posts nothing to the group', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, total: 2, sent: 2, unreachable: [], failed: [] })
    expect(sent.map(s => s.chat_id).sort()).toEqual(['102', '99']) // Kev (7) and Cai (10) owe; Ann is only owed
    expect(sent.some(s => s.chat_id === '-100123')).toBe(false)     // never the group chat
    const kev = sent.find(s => s.chat_id === '99')!
    expect(kev.text).toMatch(/^💰 <b>Tokyo Trip<\/b>\nYou owe:\n {2}• @ann {2}≈ SGD \d+\.\d\d \(JPY 3000\.00 \+ USD 18\.50\)$/)
    expect(sent.find(s => s.chat_id === '102')!.text).toContain('  • @kev  SGD 20.00')
  })

  it('each message has an Open Split button for this group', async () => {
    await call()
    expect(sent[0].reply_markup).toEqual({ inline_keyboard: [[{ text: 'Open Split', url: 'https://t.me/bot/split?startapp=-100123' }]] })
  })

  it('reports people the bot cannot message, still delivers to the rest, and does not fall back to the group', async () => {
    tgReply = chat => chat === '102'
      ? new Response(JSON.stringify({ ok: false, error_code: 403, description: "Forbidden: bot can't initiate conversation with a user" }), { status: 403 })
      : new Response(JSON.stringify({ ok: true, result: {} }))
    const body = await (await call()).json()
    expect(body).toEqual({ ok: true, total: 2, sent: 1, unreachable: ['Cai'], failed: [] })
    expect(sent.some(s => s.chat_id === '-100123')).toBe(false)
  })

  it('a real failure (rate limit) is reported separately from "not reachable"', async () => {
    tgReply = chat => chat === '99'
      ? new Response(JSON.stringify({ ok: false, error_code: 429, description: 'Too Many Requests: retry after 3' }), { status: 429 })
      : new Response(JSON.stringify({ ok: true, result: {} }))
    expect(await (await call()).json()).toEqual({ ok: true, total: 2, sent: 1, unreachable: [], failed: ['Kev'] })
  })

  it('nobody reachable: 200 with sent 0 so the app can say so', async () => {
    tgReply = () => new Response(JSON.stringify({ ok: false, error_code: 403, description: 'Forbidden' }), { status: 403 })
    expect(await (await call()).json()).toEqual({ ok: true, total: 2, sent: 0, unreachable: ['Kev', 'Cai'], failed: [] })
  })

  it('still sends in original currencies when the rates service is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('frankfurter')) return new Response('nope', { status: 500 })
      sent.push(JSON.parse(String(init?.body)))
      return new Response(JSON.stringify({ ok: true }))
    }))
    expect((await call()).status).toBe(200)
    expect(sent.find(s => s.chat_id === '99')!.text).toContain('  • @ann  JPY 3000.00 + USD 18.50')
  })

  it('nothing owed: 400 and nothing is sent', async () => {
    vi.mocked(loadSimplifiedDebts).mockResolvedValue([])
    const res = await call()
    expect(res.status).toBe(400)
    expect(sent).toHaveLength(0)
  })

  it('401 without Telegram auth, 404 for an unknown group, 403 for a non-member: nothing sent in any case', async () => {
    vi.mocked(getAuthUser).mockReturnValue(null)
    expect((await call()).status).toBe(401)
    vi.mocked(getAuthUser).mockReturnValue({ id: 99, first_name: 'Kev' } as never)
    mockSql.mockImplementationOnce((() => Promise.resolve([])) as never)
    expect((await call()).status).toBe(404)
    vi.mocked(getGroupMember).mockResolvedValue(null)
    expect((await call()).status).toBe(403)
    expect(sent).toHaveLength(0)
  })

  it('the response never contains message text or amounts', async () => {
    const text = JSON.stringify(await (await call()).json())
    expect(text).not.toMatch(/JPY|USD|SGD|owe/)
  })
})
