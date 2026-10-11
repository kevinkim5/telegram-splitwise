import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createHash } from 'crypto'
import { readFileSync } from 'fs'

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))

import { sql } from '@/lib/sql'
const mockSql = vi.mocked(sql)

const texts = () => mockSql.mock.calls.map(c => (c[0] as unknown as string[]).join('?').replace(/\s+/g, ' ').trim())

async function freshModule() {
  vi.resetModules()
  return import('../db')
}

describe('ensureSchema', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('a database already at the current version costs one read and no DDL', async () => {
    const { ensureSchema, SCHEMA_VERSION } = await freshModule()
    mockSql.mockResolvedValue([{ version: SCHEMA_VERSION }] as never)
    await ensureSchema()
    expect(mockSql).toHaveBeenCalledTimes(1)
    expect(texts()[0]).toMatch(/SELECT version FROM schema_meta/)
  })

  it('once confirmed, later calls in the same instance do nothing', async () => {
    const { ensureSchema, SCHEMA_VERSION } = await freshModule()
    mockSql.mockResolvedValue([{ version: SCHEMA_VERSION }] as never)
    await ensureSchema(); await ensureSchema(); await ensureSchema()
    expect(mockSql).toHaveBeenCalledTimes(1)
  })

  it('a database from before the marker (no schema_meta table) gets the full setup, then the marker', async () => {
    const { ensureSchema } = await freshModule()
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      if (strings.join('?').includes('SELECT version FROM schema_meta')) return Promise.reject(new Error('relation "schema_meta" does not exist'))
      return Promise.resolve([])
    }) as never)
    await ensureSchema()
    const t = texts()
    expect(t.some(x => /CREATE TABLE IF NOT EXISTS groups/.test(x))).toBe(true)
    expect(t.some(x => /CREATE TABLE IF NOT EXISTS expense_events/.test(x))).toBe(true)
    expect(t.some(x => /CREATE INDEX IF NOT EXISTS idx_settlements_group_date/.test(x))).toBe(true)
    expect(t.length).toBeGreaterThan(20)
    // the marker is written last, so a setup that failed half way is retried next time
    expect(t[t.length - 2]).toMatch(/CREATE TABLE IF NOT EXISTS schema_meta/)
    expect(t[t.length - 1]).toMatch(/INSERT INTO schema_meta/)
    expect(mockSql.mock.calls[mockSql.mock.calls.length - 1]![1]).toBe(1)
  })

  it('a database behind the current version runs the setup', async () => {
    const { ensureSchema, SCHEMA_VERSION } = await freshModule()
    mockSql.mockImplementation(((strings: TemplateStringsArray) =>
      Promise.resolve(strings.join('?').includes('SELECT version FROM schema_meta') ? [{ version: SCHEMA_VERSION - 1 }] : [])) as never)
    await ensureSchema()
    expect(texts().some(x => /CREATE TABLE IF NOT EXISTS groups/.test(x))).toBe(true)
  })

  it('a failed setup does not write the marker, so the next call retries', async () => {
    const { ensureSchema } = await freshModule()
    mockSql.mockImplementation(((strings: TemplateStringsArray) => {
      const q = strings.join('?')
      if (q.includes('SELECT version FROM schema_meta')) return Promise.reject(new Error('no table'))
      if (q.includes('expense_splits')) return Promise.reject(new Error('boom'))
      return Promise.resolve([])
    }) as never)
    await expect(ensureSchema()).rejects.toThrow('boom')
    expect(texts().some(x => /INSERT INTO schema_meta/.test(x))).toBe(false)
    mockSql.mockClear()
    await expect(ensureSchema()).rejects.toThrow('boom') // not remembered as done
    expect(mockSql).toHaveBeenCalled()
  })
})

// The stored version only means something if it changes with the schema. This fails when the schema
// text in lib/db.ts changes without a new SCHEMA_VERSION. After bumping SCHEMA_VERSION, update both
// numbers below.
describe('schema version guard', () => {
  const EXPECTED = { version: 1, fingerprint: '554dfd461944bcf4' }

  it('SCHEMA_VERSION is bumped whenever applySchema() changes', async () => {
    const src = readFileSync('lib/db.ts', 'utf8')
    const body = src.slice(src.indexOf('async function applySchema()'))
    const fingerprint = createHash('sha256').update(body.replace(/\s+/g, ' ')).digest('hex').slice(0, 16)
    const { SCHEMA_VERSION } = await freshModule()
    expect({ version: SCHEMA_VERSION, fingerprint }).toEqual(EXPECTED)
  })
})
