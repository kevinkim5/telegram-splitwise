import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { POST as parsePOST } from '../../app/api/groups/[chatId]/receipts/parse/route'
import { PUT as receiptPUT, DELETE as receiptDELETE } from '../../app/api/groups/[chatId]/expenses/[id]/receipt/route'
import { GET as expenseGET } from '../../app/api/groups/[chatId]/expenses/[id]/route'

const mockSql = vi.mocked(sql)
const mockGetAuthUser = vi.mocked(getAuthUser)

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46])
const USER = { id: 99, first_name: 'Kev' }

type Handler = [RegExp, unknown | ((vals: unknown[]) => unknown)]

// Route SQL by statement text. Anything unmatched returns no rows.
function routeSql(handlers: Handler[]) {
  mockSql.mockImplementation(((strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join('?').replace(/\s+/g, ' ')
    for (const [re, res] of handlers) {
      if (re.test(q)) return Promise.resolve(typeof res === 'function' ? (res as (v: unknown[]) => unknown)(vals) : res)
    }
    return Promise.resolve([])
  }) as never)
}

const sqlTexts = () => mockSql.mock.calls.map(c => (c[0] as unknown as string[]).join('?'))

const memberOk: Handler[] = [
  [/FROM groups/, [{ id: 5 }]],
  [/FROM members WHERE group_id/, [{ id: 7 }]],
]

function imgReq(url: string, method: string, body: Uint8Array = JPEG, headers: Record<string, string> = {}) {
  return new Request(url, { method, body: body as BodyInit, headers })
}

const parseProps = { params: Promise.resolve({ chatId: '-100123' }) }
const receiptProps = { params: Promise.resolve({ chatId: '-100123', id: '42' }) }

type FetchCall = { url: string; method: string; headers: Headers; body?: unknown }
let fetchCalls: FetchCall[]
let fetchImpl: (call: FetchCall) => Response | Promise<Response>

function stubFetch() {
  fetchCalls = []
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: RequestInit) => {
    const req = input instanceof Request ? input : null
    const call: FetchCall = {
      url: req ? req.url : String(input),
      method: init?.method ?? req?.method ?? 'GET',
      headers: new Headers(init?.headers ?? req?.headers),
      body: init?.body,
    }
    fetchCalls.push(call)
    return fetchImpl(call)
  }))
}

const R2_ENV = {
  R2_ACCOUNT_ID: 'acct123', R2_ACCESS_KEY_ID: 'AKIATEST', R2_SECRET_ACCESS_KEY: 'secret', R2_BUCKET: 'bkt',
}
const envKeys = ['GEMINI_API_KEY', 'GEMINI_RECEIPT_MODEL', ...Object.keys(R2_ENV)]
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of envKeys) { savedEnv[k] = process.env[k]; delete process.env[k] }
  mockGetAuthUser.mockReturnValue(USER as never)
  stubFetch()
})
afterEach(() => {
  vi.unstubAllGlobals()
  for (const k of envKeys) { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k] }
})

const geminiOk = (fields: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(fields) }] } }] }), { status: 200 })

// ─── POST /receipts/parse ─────────────────────────────────────────────────────

describe('POST /receipts/parse', () => {
  const call = (body: Uint8Array = JPEG) => parsePOST(imgReq('http://x/receipts/parse', 'POST', body), parseProps)

  it('401s without valid Telegram auth', async () => {
    mockGetAuthUser.mockReturnValue(null)
    expect((await call()).status).toBe(401)
  })

  it('503s when GEMINI_API_KEY is not set, before touching the database', async () => {
    const res = await call()
    expect(res.status).toBe(503)
    expect(mockSql).not.toHaveBeenCalled()
  })

  it('403s for a non-member and never calls the model', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([[/FROM groups/, [{ id: 5 }]], [/FROM members/, []]])
    expect((await call()).status).toBe(403)
    expect(fetchCalls).toHaveLength(0)
  })

  it('415s for a non-image body', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql(memberOk)
    expect((await call(new TextEncoder().encode('hello'))).status).toBe(415)
    expect(fetchCalls).toHaveLength(0)
  })

  it('429s once the hourly cap is reached, without calling the model', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/FROM receipt_scans/, [{ n: 20 }]]])
    expect((await call()).status).toBe(429)
    expect(fetchCalls).toHaveLength(0)
  })

  it('returns normalized fields and sends the image to Gemini as JSON-mode inline data', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => geminiOk({
      merchant: 'Din Tai Fung', total: 58.4, currency: 'sgd', date: '2999-01-01', category: 'Food',
    })

    const res = await call()
    expect(res.status).toBe(200)
    // currency uppercased, category mapped to the app's label, impossible future date dropped
    expect(await res.json()).toEqual({
      merchant: 'Din Tai Fung', total: 58.4, currency: 'SGD', date: null, category: '🍜 Food',
    })

    // usage was logged for rate limiting
    expect(sqlTexts().some(t => t.includes('INSERT INTO receipt_scans'))).toBe(true)

    const gemini = fetchCalls[0]!
    expect(gemini.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent')
    expect(gemini.headers.get('x-goog-api-key')).toBe('gem-test')
    expect(gemini.url).not.toContain('gem-test') // key travels in a header, never the URL
    const sent = JSON.parse(gemini.body as string)
    expect(sent.generationConfig).toMatchObject({
      responseMimeType: 'application/json', temperature: 0, thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 1024,
    })
    expect(sent.generationConfig.responseSchema.required).toContain('total')
    const part = sent.contents[0].parts[0].inline_data
    expect(part.mime_type).toBe('image/jpeg')
    expect(Buffer.from(part.data, 'base64')).toEqual(Buffer.from(JPEG))
  })

  it('honours GEMINI_RECEIPT_MODEL (incl. aliases) and leaves thinking/output limits at Google defaults', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    process.env.GEMINI_RECEIPT_MODEL = 'gemini-flash-latest'
    routeSql([...memberOk, [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => geminiOk({ merchant: 'X', total: 1, currency: null, date: null, category: null })
    expect((await call()).status).toBe(200)
    expect(fetchCalls[0]!.url).toContain('/models/gemini-flash-latest:generateContent')
    const cfg = JSON.parse(fetchCalls[0]!.body as string).generationConfig
    expect(cfg).not.toHaveProperty('thinkingConfig')
    expect(cfg).not.toHaveProperty('maxOutputTokens') // never truncate JSON for models that may think
  })

  it('422s when nothing could be read', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => geminiOk({ merchant: null, total: null, currency: null, date: null, category: null })
    expect((await call()).status).toBe(422)
  })

  it('treats a blocked/empty or non-JSON model response as unreadable (422), not a crash', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })
    expect((await call()).status).toBe(422)
    fetchImpl = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'sorry, I cannot' }] } }] }), { status: 200 })
    expect((await call()).status).toBe(422)
  })

  it('maps Gemini quota exhaustion (429) to a friendly 429', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => new Response('quota', { status: 429 })
    const res = await call()
    expect(res.status).toBe(429)
    expect((await res.json()).error).toMatch(/busy/i)
  })

  it('502s when the model API errors', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => new Response('boom', { status: 500 })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await call()).status).toBe(502)
    spy.mockRestore()
  })
})

// ─── PUT/DELETE /expenses/[id]/receipt ────────────────────────────────────────

describe('PUT /expenses/[id]/receipt', () => {
  const put = (body: Uint8Array = JPEG) => receiptPUT(imgReq('http://x/receipt', 'PUT', body), receiptProps)
  const expenseRow = (receipt_key: string | null): Handler => [/FROM expenses/, [{ id: 42, receipt_key }]]

  it('503s when storage is not configured', async () => {
    routeSql([...memberOk, expenseRow(null)])
    expect((await put()).status).toBe(503)
    expect(fetchCalls).toHaveLength(0)
  })

  it('404s for an unknown or other-group expense', async () => {
    Object.assign(process.env, R2_ENV)
    routeSql([...memberOk, [/FROM expenses/, []]])
    expect((await put()).status).toBe(404)
  })

  it('403s for a non-member', async () => {
    Object.assign(process.env, R2_ENV)
    routeSql([[/FROM groups/, [{ id: 5 }]], [/FROM members/, []]])
    expect((await put()).status).toBe(403)
  })

  it('rejects a non-image before uploading anything', async () => {
    Object.assign(process.env, R2_ENV)
    routeSql([...memberOk, expenseRow(null)])
    expect((await put(new TextEncoder().encode('<html>'))).status).toBe(415)
    expect(fetchCalls).toHaveLength(0)
  })

  it('stores the image under the group, saves the key, and returns a signed URL', async () => {
    Object.assign(process.env, R2_ENV)
    const updates: unknown[][] = []
    routeSql([
      ...memberOk, expenseRow(null),
      [/UPDATE expenses SET receipt_key/, (vals: unknown[]) => { updates.push(vals); return [] }],
    ])
    fetchImpl = () => new Response(null, { status: 200 })

    const res = await put()
    expect(res.status).toBe(200)

    const upload = fetchCalls[0]!
    expect(upload.method).toBe('PUT')
    expect(upload.url).toMatch(/^https:\/\/acct123\.r2\.cloudflarestorage\.com\/bkt\/receipts\/5\/42-[0-9a-f-]{36}\.jpg$/)
    expect(upload.headers.get('content-type')).toBe('image/jpeg')
    expect(upload.headers.get('authorization')).toContain('AWS4-HMAC-SHA256')

    const key = updates[0]![0] as string
    expect(upload.url.endsWith(key)).toBe(true)
    expect((await res.json()).receipt_url).toContain('X-Amz-Signature=')
    expect(fetchCalls).toHaveLength(1) // no previous receipt to clean up
  })

  it('deletes the previous image only after the new one is saved', async () => {
    Object.assign(process.env, R2_ENV)
    routeSql([...memberOk, expenseRow('receipts/5/42-old.jpg')])
    fetchImpl = () => new Response(null, { status: 200 })

    expect((await put()).status).toBe(200)
    expect(fetchCalls.map(c => c.method)).toEqual(['PUT', 'DELETE'])
    expect(fetchCalls[1]!.url).toContain('/bkt/receipts/5/42-old.jpg')
  })

  it('502s and leaves the database untouched when the upload fails', async () => {
    Object.assign(process.env, R2_ENV)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    routeSql([...memberOk, expenseRow('receipts/5/42-old.jpg')])
    fetchImpl = () => new Response('denied', { status: 403 })

    expect((await put()).status).toBe(502)
    expect(sqlTexts().some(t => t.includes('UPDATE expenses SET receipt_key'))).toBe(false)
    expect(fetchCalls.every(c => c.method === 'PUT')).toBe(true) // old image kept
    spy.mockRestore()
  })

  it('removes the just-uploaded object if saving the key fails', async () => {
    Object.assign(process.env, R2_ENV)
    routeSql([
      ...memberOk, expenseRow(null),
      [/UPDATE expenses SET receipt_key/, () => { throw new Error('db down') }],
    ])
    fetchImpl = () => new Response(null, { status: 200 })

    await expect(put()).rejects.toThrow('db down')
    expect(fetchCalls.map(c => c.method)).toEqual(['PUT', 'DELETE'])
    expect(fetchCalls[1]!.url).toBe(fetchCalls[0]!.url)
  })
})

describe('DELETE /expenses/[id]/receipt', () => {
  const del = () => receiptDELETE(new Request('http://x/receipt', { method: 'DELETE' }), receiptProps)

  it('clears the key and deletes the stored object', async () => {
    Object.assign(process.env, R2_ENV)
    routeSql([...memberOk, [/FROM expenses/, [{ id: 42, receipt_key: 'receipts/5/42-abc.jpg' }]]])
    fetchImpl = () => new Response(null, { status: 204 })

    expect((await del()).status).toBe(200)
    expect(sqlTexts().some(t => t.includes('SET receipt_key = NULL'))).toBe(true)
    expect(fetchCalls.map(c => c.method)).toEqual(['DELETE'])
  })

  it('is a no-op when there is no receipt', async () => {
    Object.assign(process.env, R2_ENV)
    routeSql([...memberOk, [/FROM expenses/, [{ id: 42, receipt_key: null }]]])
    expect((await del()).status).toBe(200)
    expect(fetchCalls).toHaveLength(0)
  })
})

// ─── GET /expenses/[id] exposes a signed URL, never the storage key ───────────

describe('GET /expenses/[id] receipt fields', () => {
  const get = () => expenseGET(new Request('http://x/expenses/42'), receiptProps)

  it('returns has_receipt and a signed receipt_url, and hides receipt_key', async () => {
    Object.assign(process.env, R2_ENV)
    routeSql([
      [/FROM groups/, [{ id: 5 }]],
      [/FROM members WHERE group_id/, [{ id: 7 }]],
      [/FROM expenses e/, [{ id: 42, group_id: 5, description: 'Lunch', receipt_key: 'receipts/5/42-abc.jpg' }]],
      [/FROM expense_splits/, []],
    ])
    const body = await (await get()).json()
    expect(body.has_receipt).toBe(true)
    expect(body.receipt_url).toContain('/bkt/receipts/5/42-abc.jpg?')
    expect(body).not.toHaveProperty('receipt_key')
  })

  it('returns has_receipt false and no URL for an expense without a receipt', async () => {
    Object.assign(process.env, R2_ENV)
    routeSql([
      [/FROM groups/, [{ id: 5 }]],
      [/FROM members WHERE group_id/, [{ id: 7 }]],
      [/FROM expenses e/, [{ id: 42, group_id: 5, description: 'Lunch', receipt_key: null }]],
      [/FROM expense_splits/, []],
    ])
    const body = await (await get()).json()
    expect(body).toMatchObject({ has_receipt: false, receipt_url: null })
  })
})
