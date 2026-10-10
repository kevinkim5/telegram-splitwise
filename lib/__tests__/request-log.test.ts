import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { logRequest } from '@/lib/request-log'
import { getAuthUser } from '@/lib/auth'

describe('logRequest', () => {
  let log: ReturnType<typeof vi.spyOn>
  beforeEach(() => { log = vi.spyOn(console, 'log').mockImplementation(() => {}) })
  afterEach(() => log.mockRestore())

  const line = () => JSON.parse(log.mock.calls[0][0] as string)

  it('logs who made the call, the method and the path', () => {
    logRequest(new Request('http://x/api/groups/-100123/expenses/40', { method: 'PUT' }), { id: 99, first_name: 'Kev', username: 'kev' })
    expect(line()).toEqual({ evt: 'api', user: 99, username: 'kev', method: 'PUT', path: '/api/groups/-100123/expenses/40' })
  })

  it('never logs the query string (receipt links carry a signature there) or names', () => {
    logRequest(new Request('http://x/api/groups/-1/expenses/4/receipt?exp=1&sig=SECRET'), { id: 99, first_name: 'Kev', last_name: 'Kim' })
    const raw = log.mock.calls[0][0] as string
    expect(raw).not.toContain('SECRET')
    expect(raw).not.toContain('Kim')
    expect(line()).toMatchObject({ user: 99, username: null, path: '/api/groups/-1/expenses/4/receipt' })
  })

  it('logs rejected calls without any user or credentials', () => {
    logRequest(new Request('http://x/api/groups/-1/balances', { headers: { 'x-telegram-init-data': 'hash=abc&user=%7B%7D' } }), null)
    expect(line()).toEqual({ evt: 'api_denied', method: 'GET', path: '/api/groups/-1/balances' })
    expect(log.mock.calls[0][0]).not.toContain('abc')
  })
})

describe('getAuthUser logging', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

  it('logs the verified user on every authenticated call (outside tests)', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BOT_TOKEN', '')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    const initData = new URLSearchParams({ user: JSON.stringify({ id: 42, first_name: 'Ann', username: 'ann' }) }).toString()
    getAuthUser(new Request('http://x/api/groups/-1/balances', { headers: { 'x-telegram-init-data': initData } }))
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({ evt: 'api', user: 42, username: 'ann', method: 'GET', path: '/api/groups/-1/balances' })
  })

  it('logs a denied call when the signature is invalid', () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('BOT_TOKEN', 'real-token')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(getAuthUser(new Request('http://x/api/groups/-1/balances', { headers: { 'x-telegram-init-data': 'hash=00&user=%7B%22id%22%3A1%7D' } }))).toBeNull()
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual({ evt: 'api_denied', method: 'GET', path: '/api/groups/-1/balances' })
  })
})
