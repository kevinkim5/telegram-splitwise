import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@vercel/blob', () => {
  class BlobNotFoundError extends Error {}
  return { put: vi.fn(), get: vi.fn(), del: vi.fn(), BlobNotFoundError }
})

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { del, get, put } from '@vercel/blob'
import { receiptViewUrl } from '@/lib/receipt-storage'
import { POST as parsePOST } from '../../app/api/groups/[chatId]/receipts/parse/route'
import { GET as receiptGET, PUT as receiptPUT, DELETE as receiptDELETE } from '../../app/api/groups/[chatId]/expenses/[id]/receipt/route'
import { GET as expenseGET } from '../../app/api/groups/[chatId]/expenses/[id]/route'

const mockSql = vi.mocked(sql)
const mockGetAuthUser = vi.mocked(getAuthUser)
const mockPut = vi.mocked(put)
const mockGet = vi.mocked(get)
const mockDel = vi.mocked(del)

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
const refunded = () => sqlTexts().some(t => t.includes('DELETE FROM receipt_scans'))

// group + membership are one query now: the group row carries the caller's member id (null = not a member)
const GROUP_ROW = { id: 5, title: 'Trip', currency: 'SGD' }
const memberOk: Handler[] = [
  [/FROM groups/, [{ ...GROUP_ROW, member_id: 7 }]],
]
const notMember: Handler[] = [
  [/FROM groups/, [{ ...GROUP_ROW, member_id: null }]],
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

const BLOB_ENV = { BLOB_READ_WRITE_TOKEN: 'vercel_blob_rw_test_token' }
const envKeys = ['GEMINI_API_KEY', 'GEMINI_RECEIPT_MODEL', 'VERCEL_ENV', ...Object.keys(BLOB_ENV)]
const savedEnv: Record<string, string | undefined> = {}

beforeEach(() => {
  vi.clearAllMocks()
  for (const k of envKeys) { savedEnv[k] = process.env[k]; delete process.env[k] }
  mockGetAuthUser.mockReturnValue(USER as never)
  mockPut.mockResolvedValue({} as never)
  mockDel.mockResolvedValue(undefined as never)
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
    routeSql(notMember)
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

  it('returns normalized fields and sends the image to the default Gemini alias as JSON-mode inline data', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/INSERT INTO receipt_scans/, [{ id: 77 }]], [/FROM receipt_scans/, [{ n: 0 }]]])
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
    expect(gemini.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent')
    expect(gemini.headers.get('x-goog-api-key')).toBe('gem-test')
    expect(gemini.url).not.toContain('gem-test') // key travels in a header, never the URL
    const sent = JSON.parse(gemini.body as string)
    expect(sent.generationConfig).toMatchObject({ responseMimeType: 'application/json', temperature: 0 })
    // the alias may point at a model that thinks: never cap output or pass model-specific thinking options
    expect(sent.generationConfig).not.toHaveProperty('thinkingConfig')
    expect(sent.generationConfig).not.toHaveProperty('maxOutputTokens')
    expect(sent.generationConfig.responseSchema.required).toContain('total')
    const part = sent.contents[0].parts[0].inline_data
    expect(part.mime_type).toBe('image/jpeg')
    expect(Buffer.from(part.data, 'base64')).toEqual(Buffer.from(JPEG))
  })

  it('turns thinking off and caps output only when pinned to a 2.5 Flash model', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    process.env.GEMINI_RECEIPT_MODEL = 'gemini-2.5-flash'
    routeSql([...memberOk, [/INSERT INTO receipt_scans/, [{ id: 77 }]], [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => geminiOk({ merchant: 'X', total: 1, currency: null, date: null, category: null })
    expect((await call()).status).toBe(200)
    expect(fetchCalls[0]!.url).toContain('/models/gemini-2.5-flash:generateContent')
    expect(JSON.parse(fetchCalls[0]!.body as string).generationConfig).toMatchObject({
      thinkingConfig: { thinkingBudget: 0 }, maxOutputTokens: 1024,
    })
  })

  it('honours a GEMINI_RECEIPT_MODEL override and leaves thinking/output limits at Google defaults', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    process.env.GEMINI_RECEIPT_MODEL = 'gemini-3.8-flash'
    routeSql([...memberOk, [/INSERT INTO receipt_scans/, [{ id: 77 }]], [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => geminiOk({ merchant: 'X', total: 1, currency: null, date: null, category: null })
    expect((await call()).status).toBe(200)
    expect(fetchCalls[0]!.url).toContain('/models/gemini-3.8-flash:generateContent')
    const cfg = JSON.parse(fetchCalls[0]!.body as string).generationConfig
    expect(cfg).not.toHaveProperty('thinkingConfig')
    expect(cfg).not.toHaveProperty('maxOutputTokens') // never truncate JSON for models that may think
  })

  it('422s when nothing could be read', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/INSERT INTO receipt_scans/, [{ id: 77 }]], [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => geminiOk({ merchant: null, total: null, currency: null, date: null, category: null })
    expect((await call()).status).toBe(422)
  })

  it('treats a blocked/empty or non-JSON model response as unreadable (422), not a crash', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/INSERT INTO receipt_scans/, [{ id: 77 }]], [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => new Response(JSON.stringify({ candidates: [] }), { status: 200 })
    expect((await call()).status).toBe(422)
    fetchImpl = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'sorry, I cannot' }] } }] }), { status: 200 })
    expect((await call()).status).toBe(422)
  })

  it('maps Gemini quota exhaustion (429) to a friendly 429', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/INSERT INTO receipt_scans/, [{ id: 77 }]], [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => new Response('quota', { status: 429 })
    const res = await call()
    expect(res.status).toBe(429)
    expect((await res.json()).error).toMatch(/usage limit/i)
    expect(fetchCalls).toHaveLength(1) // quota errors are not retried
    expect(refunded()).toBe(true)
  })

  it('surfaces a retired/unknown model (404) as a 502 and logs Google\'s message for the operator', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/INSERT INTO receipt_scans/, [{ id: 77 }]], [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => new Response(JSON.stringify({ error: { code: 404, message: 'This model is no longer available to new users' } }), { status: 404 })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect((await call()).status).toBe(502)
    expect(spy.mock.calls.flat().join(' ')).toContain('no longer available')
    spy.mockRestore()
  })

  it('502s with a non-retry message when the request itself is rejected (400/403)', async () => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/INSERT INTO receipt_scans/, [{ id: 77 }]], [/FROM receipt_scans/, [{ n: 0 }]]])
    fetchImpl = () => new Response('bad request', { status: 400 })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const res = await call()
    expect(res.status).toBe(502)
    expect((await res.json()).error).toMatch(/fill in the details yourself/i)
    expect(fetchCalls).toHaveLength(1) // setup problems are not retried
    spy.mockRestore()
  })
})

describe('POST /receipts/parse: timing log', () => {
  const call = () => parsePOST(imgReq('http://x/receipts/parse', 'POST'), parseProps)
  const okFields = { merchant: 'Kopi', total: 4.5, currency: 'SGD', date: null, category: null }
  const timingInsert = () => {
    const c = mockSql.mock.calls.find(c => (c[0] as unknown as string[]).join('?').includes('INSERT INTO receipt_scan_timings'))
    return c ? (c as unknown[]).slice(1) : null
  }
  // insert order: user, model, outcome, total_ms, gemini_ms, attempts, http_status, image_bytes, prompt, thought, output

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/INSERT INTO receipt_scans/, [{ id: 77 }]], [/FROM receipt_scans/, [{ n: 0 }]]])
  })

  it('records model, time, tries, status, image size and Google\'s token counts for a good scan', async () => {
    fetchImpl = () => new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify(okFields) }] } }],
      usageMetadata: { promptTokenCount: 1180, thoughtsTokenCount: 640, candidatesTokenCount: 55 },
    }), { status: 200 })
    expect((await call()).status).toBe(200)
    const v = timingInsert()!
    expect(v[0]).toBe(99)
    expect(v[1]).toBe('gemini-flash-latest')
    expect(v[2]).toBe('ok')
    expect(typeof v[3]).toBe('number')
    expect(typeof v[4]).toBe('number')
    expect(v.slice(5)).toEqual([1, 200, JPEG.byteLength, 1180, 640, 55])
  })

  it('a missing usageMetadata is stored as null, not zero', async () => {
    fetchImpl = () => geminiOk(okFields)
    await call()
    expect(timingInsert()!.slice(8)).toEqual([null, null, null])
  })

  it('records unreadable photos, quota hits and timeouts as their own outcomes', async () => {
    fetchImpl = () => geminiOk({ merchant: null, total: null, currency: null, date: null, category: null })
    await call()
    expect(timingInsert()![2]).toBe('unreadable')

    mockSql.mockClear()
    fetchImpl = () => new Response('quota', { status: 429 })
    await call()
    expect(timingInsert()![2]).toBe('rate_limited')
    expect(timingInsert()![6]).toBe(429)

    mockSql.mockClear()
    fetchImpl = () => { throw new Error('aborted') }
    await call()
    expect(timingInsert()![2]).toBe('timeout')
  })

  it('a failed scan is still timed (even though it is refunded), with both tries counted', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      fetchImpl = () => new Response('overloaded', { status: 503 })
      const p = call()
      for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(1000)
      expect((await p).status).toBe(503)
    } finally {
      vi.useRealTimers()
    }
    const v = timingInsert()!
    expect(v[2]).toBe('overloaded')
    expect(v[5]).toBe(2)
    expect(refunded()).toBe(true)
  })

  it('if writing the timing fails the scan still succeeds', async () => {
    routeSql([...memberOk, [/INSERT INTO receipt_scans/, [{ id: 77 }]], [/FROM receipt_scans/, [{ n: 0 }]],
      [/INSERT INTO receipt_scan_timings/, () => { throw new Error('table missing') }]])
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const q = strings.join('?')
      if (q.includes('receipt_scan_timings')) return Promise.reject(new Error('table missing'))
      if (q.includes('FROM groups')) return Promise.resolve([{ id: 5, title: 'Trip', currency: 'SGD', member_id: 7 }])
      if (q.includes('INSERT INTO receipt_scans')) return Promise.resolve([{ id: 77 }])
      if (q.includes('FROM receipt_scans')) return Promise.resolve([{ n: 0 }])
      return Promise.resolve([])
    }) as never)
    fetchImpl = () => geminiOk(okFields)
    expect((await call()).status).toBe(200)
  })
})

describe('POST /receipts/parse: provider overload', () => {
  const call = () => parsePOST(imgReq('http://x/receipts/parse', 'POST'), parseProps)
  const okFields = { merchant: 'Kopi', total: 4.5, currency: 'SGD', date: null, category: null }

  // The route waits ~1.5s before its single retry; drive that timer by hand instead of sleeping.
  async function callWithTimers() {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    try {
      const p = call()
      for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(1000)
      return await p
    } finally {
      vi.useRealTimers()
    }
  }

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'gem-test'
    routeSql([...memberOk, [/INSERT INTO receipt_scans/, [{ id: 77 }]], [/FROM receipt_scans/, [{ n: 0 }]]])
  })

  it('retries once after a 503 and succeeds without the user noticing', async () => {
    let n = 0
    fetchImpl = () => (++n === 1 ? new Response('overloaded', { status: 503 }) : geminiOk(okFields))
    const res = await callWithTimers()
    expect(res.status).toBe(200)
    expect(fetchCalls).toHaveLength(2)
    expect(refunded()).toBe(false)
  })

  it('also retries a transient 500', async () => {
    let n = 0
    fetchImpl = () => (++n === 1 ? new Response('internal', { status: 500 }) : geminiOk(okFields))
    expect((await callWithTimers()).status).toBe(200)
    expect(fetchCalls).toHaveLength(2)
  })

  it('shows a distinct "overloaded" message after two 503s, and does not count the scan', async () => {
    fetchImpl = () => new Response('overloaded', { status: 503 })
    const res = await callWithTimers()
    expect(res.status).toBe(503)
    const { error } = await res.json()
    expect(error).toMatch(/overloaded/i)
    expect(error).toMatch(/fill in the details yourself/i)
    expect(error).not.toMatch(/usage limit/i) // different cause, different wording
    expect(fetchCalls).toHaveLength(2) // exactly one retry, never a loop
    expect(refunded()).toBe(true)
  })

  it('gives a distinct message for a timeout and refunds the scan', async () => {
    fetchImpl = () => { throw new Error('aborted') }
    const res = await call()
    expect(res.status).toBe(504)
    expect((await res.json()).error).toMatch(/took too long/i)
    expect(refunded()).toBe(true)
  })

  it('still counts a scan the model read but found nothing in (the user\'s photo, not an outage)', async () => {
    fetchImpl = () => geminiOk({ merchant: null, total: null, currency: null, date: null, category: null })
    expect((await call()).status).toBe(422)
    expect(refunded()).toBe(false)
  })
})

// ─── PUT/DELETE /expenses/[id]/receipt ────────────────────────────────────────

describe('PUT /expenses/[id]/receipt', () => {
  const put_ = (body: Uint8Array = JPEG) => receiptPUT(imgReq('http://x/receipt', 'PUT', body), receiptProps)
  const expenseRow = (receipt_key: string | null): Handler => [/FROM expenses/, [{ id: 42, receipt_key }]]

  it('503s when storage is not configured', async () => {
    routeSql([...memberOk, expenseRow(null)])
    expect((await put_()).status).toBe(503)
    expect(mockPut).not.toHaveBeenCalled()
  })

  it('404s for an unknown or other-group expense', async () => {
    Object.assign(process.env, BLOB_ENV)
    routeSql([...memberOk, [/FROM expenses/, []]])
    expect((await put_()).status).toBe(404)
  })

  it('403s for a non-member', async () => {
    Object.assign(process.env, BLOB_ENV)
    routeSql(notMember)
    expect((await put_()).status).toBe(403)
  })

  it('rejects a non-image before storing anything', async () => {
    Object.assign(process.env, BLOB_ENV)
    routeSql([...memberOk, expenseRow(null)])
    expect((await put_(new TextEncoder().encode('<html>'))).status).toBe(415)
    expect(mockPut).not.toHaveBeenCalled()
  })

  it('stores a PRIVATE image under the group, saves the key, and returns a signed view link', async () => {
    Object.assign(process.env, BLOB_ENV)
    const updates: unknown[][] = []
    routeSql([
      ...memberOk, expenseRow(null),
      [/UPDATE expenses SET receipt_key/, (vals: unknown[]) => { updates.push(vals); return [] }],
    ])

    const res = await put_()
    expect(res.status).toBe(200)

    const [key, body, opts] = mockPut.mock.calls[0]!
    expect(key).toMatch(/^staging\/receipts\/5\/42-[0-9a-f-]{36}\.jpg$/)
    expect(Buffer.from(body as Buffer)).toEqual(Buffer.from(JPEG))
    expect(opts).toMatchObject({ access: 'private', contentType: 'image/jpeg', addRandomSuffix: false, allowOverwrite: false })
    expect(updates[0]![0]).toBe(key)

    expect((await res.json()).receipt_url).toMatch(/^\/api\/groups\/-100123\/expenses\/42\/receipt\?exp=\d+&sig=[0-9a-f]{64}$/)
    expect(mockDel).not.toHaveBeenCalled() // nothing to clean up
  })

  it('deletes the previous image only after the new one is saved', async () => {
    Object.assign(process.env, BLOB_ENV)
    routeSql([...memberOk, expenseRow('staging/receipts/5/42-old.jpg')])
    const order: string[] = []
    mockPut.mockImplementation((async () => { order.push('put') }) as never)
    mockDel.mockImplementation((async () => { order.push('del') }) as never)

    expect((await put_()).status).toBe(200)
    expect(order).toEqual(['put', 'del'])
    expect(mockDel).toHaveBeenCalledWith('staging/receipts/5/42-old.jpg')
  })

  it('502s and leaves the database and old image untouched when storing fails', async () => {
    Object.assign(process.env, BLOB_ENV)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    routeSql([...memberOk, expenseRow('staging/receipts/5/42-old.jpg')])
    mockPut.mockRejectedValue(new Error('store down'))

    expect((await put_()).status).toBe(502)
    expect(sqlTexts().some(t => t.includes('UPDATE expenses SET receipt_key'))).toBe(false)
    expect(mockDel).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('removes the just-stored object if saving the key fails', async () => {
    Object.assign(process.env, BLOB_ENV)
    routeSql([
      ...memberOk, expenseRow(null),
      [/UPDATE expenses SET receipt_key/, () => { throw new Error('db down') }],
    ])

    await expect(put_()).rejects.toThrow('db down')
    expect(mockDel).toHaveBeenCalledTimes(1)
    expect(mockDel).toHaveBeenCalledWith(mockPut.mock.calls[0]![0])
  })
})

describe('DELETE /expenses/[id]/receipt', () => {
  const del_ = () => receiptDELETE(new Request('http://x/receipt', { method: 'DELETE' }), receiptProps)

  it('clears the key and deletes the stored object', async () => {
    Object.assign(process.env, BLOB_ENV)
    routeSql([...memberOk, [/FROM expenses/, [{ id: 42, receipt_key: 'staging/staging/receipts/5/42-abc.jpg' }]]])

    expect((await del_()).status).toBe(200)
    expect(sqlTexts().some(t => t.includes('SET receipt_key = NULL'))).toBe(true)
    expect(mockDel).toHaveBeenCalledWith('staging/staging/receipts/5/42-abc.jpg')
  })

  it('is a no-op when there is no receipt', async () => {
    Object.assign(process.env, BLOB_ENV)
    routeSql([...memberOk, [/FROM expenses/, [{ id: 42, receipt_key: null }]]])
    expect((await del_()).status).toBe(200)
    expect(mockDel).not.toHaveBeenCalled()
  })
})

// ─── GET /expenses/[id]/receipt (signed link, no Telegram headers) ────────────

describe('GET /expenses/[id]/receipt', () => {
  const KEY = 'staging/staging/receipts/5/42-abc.jpg'
  const withKey = (key: string | null): Handler[] => [[/FROM expenses e JOIN groups g/, key ? [{ receipt_key: key }] : []]]
  const fileStream = () => new Response(JPEG).body!
  const okBlob = () => mockGet.mockResolvedValue({
    statusCode: 200, stream: fileStream(), headers: new Headers(), blob: { contentType: 'image/jpeg', size: JPEG.length },
  } as never)
  const fetchLink = (url: string) => receiptGET(new Request(`http://x${url}`), receiptProps)

  beforeEach(() => { Object.assign(process.env, BLOB_ENV) })

  it('streams the image for a valid link, without needing Telegram auth', async () => {
    mockGetAuthUser.mockReturnValue(null) // no headers: <img src> can't send any
    routeSql(withKey(KEY))
    okBlob()

    const res = await fetchLink(receiptViewUrl('-100123', 42, KEY))
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('image/jpeg')
    expect(res.headers.get('cache-control')).toContain('private')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(JPEG)
    expect(mockGet).toHaveBeenCalledWith(KEY, { access: 'private' })
  })

  it('403s for a tampered signature, a missing signature, or an expired link', async () => {
    routeSql(withKey(KEY))
    okBlob()
    const good = receiptViewUrl('-100123', 42, KEY)
    expect((await fetchLink(good.replace(/sig=.{4}/, 'sig=0000'))).status).toBe(403)
    expect((await fetchLink(good.split('&sig=')[0]!)).status).toBe(403)
    expect((await fetchLink(receiptViewUrl('-100123', 42, KEY, -10))).status).toBe(403)
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('does not accept a link issued for a different expense or group', async () => {
    routeSql(withKey(KEY))
    okBlob()
    expect((await fetchLink(receiptViewUrl('-100123', 43, KEY))).status).toBe(403)
    expect((await fetchLink(receiptViewUrl('-999', 42, KEY))).status).toBe(403)
  })

  it('invalidates old links once the receipt is replaced', async () => {
    const oldLink = receiptViewUrl('-100123', 42, KEY)
    routeSql(withKey('staging/receipts/5/42-new.jpg')) // DB now points at the replacement
    okBlob()
    expect((await fetchLink(oldLink)).status).toBe(403)
  })

  it('404s when the expense has no receipt (e.g. after removal)', async () => {
    routeSql(withKey(null))
    expect((await fetchLink(receiptViewUrl('-100123', 42, KEY))).status).toBe(404)
  })

  it('404s when the stored object is missing', async () => {
    routeSql(withKey(KEY))
    mockGet.mockResolvedValue(null as never)
    expect((await fetchLink(receiptViewUrl('-100123', 42, KEY))).status).toBe(404)
  })

  it('refuses links signed with another environment\'s token', async () => {
    const link = receiptViewUrl('-100123', 42, KEY)
    process.env.BLOB_READ_WRITE_TOKEN = 'a_different_store_token'
    routeSql(withKey(KEY))
    okBlob()
    expect((await fetchLink(link)).status).toBe(403)
  })
})

// ─── Environment folders (one shared store) ───────────────────────────────────

describe('environment folders', () => {
  const put_ = () => receiptPUT(imgReq('http://x/receipt', 'PUT'), receiptProps)
  const rowWith = (key: string | null): Handler[] => [...memberOk, [/FROM expenses/, [{ id: 42, receipt_key: key }]]]

  beforeEach(() => { Object.assign(process.env, BLOB_ENV) })

  it('uploads under production/ on a production deployment', async () => {
    process.env.VERCEL_ENV = 'production'
    routeSql(rowWith(null))
    expect((await put_()).status).toBe(200)
    expect(mockPut.mock.calls[0]![0]).toMatch(/^production\/receipts\/5\/42-/)
  })

  it('uploads under staging/ for preview deployments and when VERCEL_ENV is unset', async () => {
    process.env.VERCEL_ENV = 'preview'
    routeSql(rowWith(null))
    await put_()
    delete process.env.VERCEL_ENV
    await put_()
    expect(mockPut.mock.calls.map(c => c[0])).toEqual([
      expect.stringMatching(/^staging\//), expect.stringMatching(/^staging\//),
    ])
  })

  it('staging never deletes a production file, even if its database copy points at one', async () => {
    process.env.VERCEL_ENV = 'preview'
    routeSql(rowWith('production/receipts/5/42-real.jpg'))
    expect((await receiptDELETE(new Request('http://x/r', { method: 'DELETE' }), receiptProps)).status).toBe(200)
    expect(mockDel).not.toHaveBeenCalled()

    // replacing it must not delete the production original either
    expect((await put_()).status).toBe(200)
    expect(mockDel).not.toHaveBeenCalled()
  })

  it('production never touches a staging file', async () => {
    process.env.VERCEL_ENV = 'production'
    routeSql(rowWith('staging/receipts/5/42-test.jpg'))
    await receiptDELETE(new Request('http://x/r', { method: 'DELETE' }), receiptProps)
    expect(mockDel).not.toHaveBeenCalled()
  })

  it('will not stream or link another environment\'s file', async () => {
    process.env.VERCEL_ENV = 'preview'
    const foreign = 'production/receipts/5/42-real.jpg'
    routeSql([[/FROM expenses e JOIN groups g/, [{ receipt_key: foreign }]]])
    const link = receiptViewUrl('-100123', 42, foreign)
    expect((await receiptGET(new Request(`http://x${link}`), receiptProps)).status).toBe(404)
    expect(mockGet).not.toHaveBeenCalled()

    routeSql([
      ...memberOk,
      [/FROM expenses e/, [{ id: 42, group_id: 5, description: 'x', receipt_key: foreign }]],
      [/FROM expense_splits/, []],
    ])
    const body = await (await expenseGET(new Request('http://x/expenses/42'), receiptProps)).json()
    expect(body).toMatchObject({ has_receipt: true, receipt_url: null })
  })
})

// ─── GET /expenses/[id] exposes a signed link, never the storage key ──────────

describe('GET /expenses/[id] receipt fields', () => {
  const get_ = () => expenseGET(new Request('http://x/expenses/42'), receiptProps)

  it('returns has_receipt and a signed receipt_url, and hides receipt_key', async () => {
    Object.assign(process.env, BLOB_ENV)
    routeSql([
      ...memberOk,
      [/FROM expenses e/, [{ id: 42, group_id: 5, description: 'Lunch', receipt_key: 'staging/staging/receipts/5/42-abc.jpg' }]],
      [/FROM expense_splits/, []],
    ])
    const body = await (await get_()).json()
    expect(body.has_receipt).toBe(true)
    expect(body.receipt_url).toMatch(/^\/api\/groups\/-100123\/expenses\/42\/receipt\?exp=\d+&sig=[0-9a-f]{64}$/)
    expect(JSON.stringify(body)).not.toContain('staging/receipts/5/42-abc')
    expect(body).not.toHaveProperty('receipt_key')
  })

  it('returns has_receipt false and no URL for an expense without a receipt', async () => {
    Object.assign(process.env, BLOB_ENV)
    routeSql([
      ...memberOk,
      [/FROM expenses e/, [{ id: 42, group_id: 5, description: 'Lunch', receipt_key: null }]],
      [/FROM expense_splits/, []],
    ])
    const body = await (await get_()).json()
    expect(body).toMatchObject({ has_receipt: false, receipt_url: null })
  })
})
