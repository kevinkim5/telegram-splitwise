import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.hoisted(() => { process.env.BOT_TOKEN = 'T' }) // the route reads it when imported

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { buildNotifyMessage } from '@/lib/notify-message'
import { fetchRates } from '@/lib/rates'
import type { SimplifiedDebt } from '@/types'

const names: Record<number, string> = { 7: '@kev', 8: '@ann', 9: 'Ben', 10: 'Cai' }
const display = (id: number) => names[id] ?? 'Unknown'
const debt = (from: number, to: number, amount: number, currency: string): SimplifiedDebt => ({
  from_member_id: from, from_name: names[from], to_member_id: to, to_name: names[to], amount, currency,
})
const RATES = { JPY: 0.0091, USD: 1.34, THB: 0.04 }

describe('buildNotifyMessage', () => {
  it('shows one SGD total per person owed, with the original amounts as the breakdown', () => {
    const msg = buildNotifyMessage('Tokyo Trip', [
      debt(7, 8, 3000, 'JPY'), debt(7, 8, 18.5, 'USD'), debt(7, 9, 12, 'USD'), debt(10, 7, 250, 'THB'),
    ], display, RATES)
    expect(msg).toBe([
      '💰 <b>Tokyo Trip</b> — outstanding balances',
      '',
      '<b>@kev</b> owes:',
      '  • @ann  ≈ SGD 52.09 (JPY 3000.00 + USD 18.50)', // 27.30 + 24.79
      '  • Ben  ≈ SGD 16.08 (USD 12.00)',
      '',
      '<b>Cai</b> owes:',
      '  • @kev  ≈ SGD 10.00 (THB 250.00)',
    ].join('\n'))
  })

  it('leaves SGD-only lines alone (no ≈, no breakdown)', () => {
    const msg = buildNotifyMessage('Trip', [debt(7, 8, 12, 'SGD')], display, RATES)
    expect(msg).toContain('  • @ann  SGD 12.00')
    expect(msg).not.toContain('≈')
  })

  it('counts SGD towards the total when mixed with other currencies', () => {
    const msg = buildNotifyMessage('Trip', [debt(7, 8, 10, 'SGD'), debt(7, 8, 12, 'USD')], display, RATES)
    expect(msg).toContain('  • @ann  ≈ SGD 26.08 (SGD 10.00 + USD 12.00)')
  })

  it('lists original amounts, never a partial total, if any currency has no rate', () => {
    const msg = buildNotifyMessage('Trip', [debt(7, 8, 3000, 'JPY'), debt(7, 8, 18.5, 'USD')], display, { JPY: 0.0091 })
    expect(msg).toContain('  • @ann  JPY 3000.00 + USD 18.50')
    expect(msg).not.toContain('≈')
  })

  it('falls back to original amounts when rates are unavailable', () => {
    const msg = buildNotifyMessage('Trip', [debt(7, 8, 12, 'USD')], display, null)
    expect(msg).toContain('  • @ann  USD 12.00')
    expect(msg).not.toContain('≈')
  })

  it('escapes the group title for Telegram HTML', () => {
    expect(buildNotifyMessage('A & <B>', [debt(7, 8, 1, 'SGD')], display, null)).toContain('<b>A &amp; &lt;B&gt;</b>')
  })
})

describe('fetchRates', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('cross-rates via EUR and skips the target currency', async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ base: 'EUR', date: '2026-10-05', rates: { JPY: 160, USD: 1.1, SGD: 1.5 } })))
    vi.stubGlobal('fetch', f)
    const r = await fetchRates(['jpy', 'USD', 'SGD'], 'SGD')
    expect(r).toEqual({ ok: true, rates: { JPY: 0.009375, USD: 1.363636 }, date: '2026-10-05' })
    expect(f.mock.calls[0][0]).toContain('symbols=JPY,USD,SGD')
  })

  it('reports an upstream failure instead of throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
    expect(await fetchRates(['USD'], 'SGD')).toEqual({ ok: false, status: 502, error: 'Failed to fetch rates' })
  })
})

// ── the route ──
import { POST } from '../../app/api/groups/[chatId]/notify-balances/route'
const mockSql = vi.mocked(sql)
const props = { params: Promise.resolve({ chatId: '-100123' }) }

describe('POST /notify-balances', () => {
  let sent: { text: string; parse_mode: string }[]
  beforeEach(() => {
    vi.clearAllMocks()
    sent = []
    process.env.BOT_TOKEN = 'T'
    vi.mocked(getAuthUser).mockReturnValue({ id: 99, first_name: 'Kev' } as never)
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const q = strings.join('?').replace(/\s+/g, ' ').trim()
      if (/^SELECT id, title FROM groups/.test(q)) return Promise.resolve([{ id: 5, title: 'Tokyo Trip' }])
      if (/^SELECT id FROM members WHERE group_id = \? AND telegram_user_id/.test(q)) return Promise.resolve([{ id: 7 }])
      if (/^SELECT id, first_name, last_name, username FROM members/.test(q)) {
        return Promise.resolve([{ id: 7, first_name: 'Kev', username: 'kev' }, { id: 8, first_name: 'Ann', username: 'ann' }])
      }
      if (/^SELECT id, first_name, last_name FROM members/.test(q)) {
        return Promise.resolve([{ id: 7, first_name: 'Kev' }, { id: 8, first_name: 'Ann' }])
      }
      if (/FROM expenses e JOIN expense_splits/.test(q)) {
        // Ann paid JPY 6000 and USD 37, split equally with Kev
        return Promise.resolve([
          { paid_by_member_id: 8, member_id: 7, amount: '3000', currency: 'JPY' },
          { paid_by_member_id: 8, member_id: 8, amount: '3000', currency: 'JPY' },
          { paid_by_member_id: 8, member_id: 7, amount: '18.50', currency: 'USD' },
          { paid_by_member_id: 8, member_id: 8, amount: '18.50', currency: 'USD' },
        ])
      }
      return Promise.resolve([])
    }) as never)
  })
  afterEach(() => vi.unstubAllGlobals())

  const stubFetch = (ratesOk: boolean) => vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes('frankfurter')) {
      return ratesOk
        ? new Response(JSON.stringify({ base: 'EUR', date: '2026-10-05', rates: { JPY: 164.835, USD: 1.119, SGD: 1.5 } }))
        : new Response('nope', { status: 500 })
    }
    sent.push(JSON.parse(String(init?.body)))
    return new Response(JSON.stringify({ ok: true }))
  }))

  it('sends the SGD total with the breakdown for what Kev owes Ann', async () => {
    stubFetch(true)
    const res = await POST(new Request('http://x', { method: 'POST' }), props)
    expect(res.status).toBe(200)
    expect(sent).toHaveLength(1)
    expect(sent[0].parse_mode).toBe('HTML')
    expect(sent[0].text).toMatch(/<b>@kev<\/b> owes:\n {2}• @ann {2}≈ SGD \d+\.\d\d \(JPY 3000\.00 \+ USD 18\.50\)/)
    expect(sent[0].text).not.toContain('exchange rates')
  })

  it('still sends (in original currencies) when the rates service is down', async () => {
    stubFetch(false)
    const res = await POST(new Request('http://x', { method: 'POST' }), props)
    expect(res.status).toBe(200)
    expect(sent[0].text).toContain('  • @ann  JPY 3000.00 + USD 18.50')
    expect(sent[0].text).not.toContain('≈')
  })
})
