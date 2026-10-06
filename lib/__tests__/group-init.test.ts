import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/db', () => ({ ensureSchema: vi.fn() }))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { POST as initPOST } from '../../app/api/groups/init/route'
import { checkChatMembership } from '@/lib/telegram-membership'

const mockSql = vi.mocked(sql)
const mockGetAuthUser = vi.mocked(getAuthUser)

const USER = { id: 99, first_name: 'Kev', username: 'kev' }
const CHAT = '-1001234567890'
const GROUP = { id: 5, chat_id: CHAT, title: 'Trip', currency: 'SGD', deleted_at: null }
const MEMBER = { id: 7, group_id: 5, telegram_user_id: 99, first_name: 'Kev' }

type Handler = [RegExp, unknown]
let existingGroup: { id: number } | null
let isMember: boolean

// Route SQL by statement text so each test reads like the scenario it checks
function routeSql() {
  mockSql.mockImplementation(((strings: TemplateStringsArray) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim()
    const handlers: Handler[] = [
      [/^SELECT id FROM groups WHERE chat_id/, existingGroup ? [existingGroup] : []],
      [/^SELECT id FROM members WHERE group_id/, isMember ? [{ id: 7 }] : []],
      [/^SELECT \* FROM groups WHERE chat_id/, [GROUP]],
      [/^SELECT \* FROM members WHERE group_id/, [MEMBER]],
    ]
    for (const [re, res] of handlers) if (re.test(q)) return Promise.resolve(res)
    return Promise.resolve([])
  }) as never)
}
const sqlTexts = () => mockSql.mock.calls.map(c => (c[0] as unknown as string[]).join('?').replace(/\s+/g, ' ').trim())
const writes = () => sqlTexts().filter(t => /^(INSERT|UPDATE|DELETE)/.test(t))

type TgReply = { status?: number; body: unknown } | 'network-error'
let tgReply: TgReply
let tgCalls: Array<{ url: string; body: Record<string, unknown> }>

function stubTelegram() {
  tgCalls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    tgCalls.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) })
    if (tgReply === 'network-error') throw new Error('network down')
    return new Response(JSON.stringify(tgReply.body), { status: tgReply.status ?? 200 })
  }))
}
const chatMember = (status: string, extra: Record<string, unknown> = {}) =>
  ({ body: { ok: true, result: { status, user: { id: 99 }, ...extra } } }) as TgReply

function call(body: Record<string, unknown> = { chatId: CHAT, chatTitle: 'Trip' }) {
  return initPOST(new Request('http://x/api/groups/init', { method: 'POST', body: JSON.stringify(body) }))
}

let savedToken: string | undefined
beforeEach(() => {
  vi.clearAllMocks()
  savedToken = process.env.BOT_TOKEN
  process.env.BOT_TOKEN = 'TESTTOKEN'
  mockGetAuthUser.mockReturnValue(USER as never)
  existingGroup = { id: 5 }
  isMember = true
  tgReply = chatMember('member')
  routeSql()
  stubTelegram()
})
afterEach(() => {
  vi.unstubAllGlobals()
  if (savedToken === undefined) delete process.env.BOT_TOKEN; else process.env.BOT_TOKEN = savedToken
})

// ─── Behaviour that must NOT change for existing users ────────────────────────

describe('init: existing members (no regression)', () => {
  it('lets a registered member straight in without asking Telegram, with the same response shape', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ group: GROUP, member: MEMBER, is_new_group: false })
    expect(tgCalls).toHaveLength(0)
  })

  it('still refreshes their profile (name, username, photo)', async () => {
    await call({ chatId: CHAT, chatTitle: 'Trip', photo_url: 'http://p/1.jpg' })
    expect(writes().some(t => t.startsWith('INSERT INTO members') && t.includes('ON CONFLICT'))).toBe(true)
  })

  it('keeps working when Telegram is down', async () => {
    tgReply = 'network-error'
    expect((await call()).status).toBe(200)
    expect(tgCalls).toHaveLength(0)
  })

  it('still reactivates an archived group for a registered member (existing behaviour)', async () => {
    await call()
    expect(writes().some(t => t.startsWith('UPDATE groups SET deleted_at = NULL'))).toBe(true)
  })
})

// ─── The fix ──────────────────────────────────────────────────────────────────

describe('init: new people must be confirmed by Telegram', () => {
  beforeEach(() => { isMember = false })

  it('admits a new person Telegram vouches for, and registers them', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(tgCalls).toHaveLength(1)
    expect(tgCalls[0]!.url).toBe('https://api.telegram.org/botTESTTOKEN/getChatMember')
    expect(tgCalls[0]!.body).toEqual({ chat_id: CHAT, user_id: 99 })
    expect(writes().some(t => t.startsWith('INSERT INTO members'))).toBe(true)
  })

  it.each(['creator', 'administrator', 'member'])('accepts status "%s"', async status => {
    tgReply = chatMember(status)
    expect((await call()).status).toBe(200)
  })

  it('accepts a restricted user who is still in the chat, rejects one who is not', async () => {
    tgReply = chatMember('restricted', { is_member: true })
    expect((await call()).status).toBe(200)
    tgReply = chatMember('restricted', { is_member: false })
    expect((await call()).status).toBe(403)
  })

  it.each(['left', 'kicked'])('rejects status "%s" with 403 and writes nothing', async status => {
    tgReply = chatMember(status)
    const res = await call()
    expect(res.status).toBe(403)
    expect((await res.json()).error).toMatch(/not a member/i)
    expect(writes()).toEqual([])
  })

  it('rejects a user Telegram has never heard of in that chat (400), writing nothing', async () => {
    tgReply = { status: 400, body: { ok: false, error_code: 400, description: 'Bad Request: user not found' } }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await call()).status).toBe(403)
    expect(writes()).toEqual([])
  })

  it('rejects a chat the bot is not in (400 chat not found)', async () => {
    tgReply = { status: 400, body: { ok: false, error_code: 400, description: 'Bad Request: chat not found' } }
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await call()).status).toBe(403)
  })

  it('cannot create a group, or reactivate an archived one, for a non-member', async () => {
    tgReply = chatMember('left')
    existingGroup = null // group does not exist yet
    expect((await call()).status).toBe(403)
    existingGroup = { id: 5 } // exists (possibly archived)
    expect((await call()).status).toBe(403)
    expect(writes()).toEqual([]) // no INSERT INTO groups, no UPDATE ... deleted_at = NULL, no member row
  })

  it('creates a brand-new group for a verified member', async () => {
    existingGroup = null
    const res = await call()
    expect(res.status).toBe(200)
    expect((await res.json()).is_new_group).toBe(true)
    expect(writes().some(t => t.startsWith('INSERT INTO groups'))).toBe(true)
  })

  it('reactivates an archived group for a verified member', async () => {
    expect((await call()).status).toBe(200)
    expect(writes().some(t => t.startsWith('UPDATE groups SET deleted_at = NULL'))).toBe(true)
  })

  it.each([
    ['rate limit (429)', { status: 429, body: { ok: false, error_code: 429, description: 'Too Many Requests' } }],
    ['Telegram outage (500)', { status: 500, body: { ok: false, error_code: 500, description: 'Internal' } }],
    ['network failure', 'network-error' as const],
  ])('says "try again" (503) on %s instead of guessing, writing nothing', async (_n, reply) => {
    tgReply = reply as TgReply
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call()
    expect(res.status).toBe(503)
    expect((await res.json()).error).toMatch(/try again/i)
    expect(writes()).toEqual([])
  })

  it('treats an unparseable Telegram reply as unknown (503)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>bad gateway</html>', { status: 502 })))
    expect((await call()).status).toBe(503)
  })
})

describe('init: private chats and local dev', () => {
  beforeEach(() => { isMember = false; existingGroup = null })

  it('lets someone open their own private chat with the bot, without asking Telegram', async () => {
    expect((await call({ chatId: '99', chatTitle: 'Me' })).status).toBe(200)
    expect(tgCalls).toHaveLength(0)
  })

  it("refuses another user's private-chat id, without asking Telegram", async () => {
    expect((await call({ chatId: '12345', chatTitle: 'Someone else' })).status).toBe(403)
    expect(tgCalls).toHaveLength(0)
    expect(writes()).toEqual([])
  })

  it('skips the check when there is no BOT_TOKEN (local dev, same as auth)', async () => {
    delete process.env.BOT_TOKEN
    expect((await call()).status).toBe(200)
    expect(tgCalls).toHaveLength(0)
  })
})

describe('init: input handling', () => {
  it('401s without valid Telegram login', async () => {
    mockGetAuthUser.mockReturnValue(null)
    expect((await call()).status).toBe(401)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('400s for missing fields', async () => {
    expect((await call({ chatId: CHAT })).status).toBe(400)
    expect((await call({ chatTitle: 'x' })).status).toBe(400)
  })

  it('400s for a malformed or zero chat id instead of crashing', async () => {
    expect((await call({ chatId: 'abc', chatTitle: 'x' })).status).toBe(400)
    expect((await call({ chatId: '0', chatTitle: 'x' })).status).toBe(400)
    expect((await call({ chatId: '12.5', chatTitle: 'x' })).status).toBe(400)
  })
})

// ─── checkChatMembership directly ─────────────────────────────────────────────

describe('checkChatMembership', () => {
  beforeEach(() => { process.env.BOT_TOKEN = 'TESTTOKEN' })

  it('sends chat_id as a string so large supergroup ids keep their precision', async () => {
    await checkChatMembership(BigInt('-1009999999999999'), 5)
    expect(tgCalls[0]!.body.chat_id).toBe('-1009999999999999')
    expect(tgCalls[0]!.body.user_id).toBe(5)
  })

  it('maps results', async () => {
    expect(await checkChatMembership(BigInt(CHAT), 99)).toBe('member')
    tgReply = chatMember('kicked')
    expect(await checkChatMembership(BigInt(CHAT), 99)).toBe('not-member')
    tgReply = 'network-error'
    expect(await checkChatMembership(BigInt(CHAT), 99)).toBe('unknown')
  })
})
