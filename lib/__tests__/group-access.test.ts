import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))

import { sql } from '@/lib/sql'
import { requireGroupMember } from '../group-access'

const mockSql = vi.mocked(sql)
beforeEach(() => vi.clearAllMocks())

describe('requireGroupMember (group + membership in one query)', () => {
  it('a member of an existing group: ok, with the group and the member id', async () => {
    mockSql.mockResolvedValueOnce([{ id: 5, title: 'Tokyo', currency: 'JPY', member_id: 12 }] as never)
    const r = await requireGroupMember(BigInt(-100123), 99)
    expect(r).toEqual({ ok: true, group: { id: 5, title: 'Tokyo', currency: 'JPY' }, member: { id: 12 } })
  })

  it('no such group (or an archived one): 404 "Group not found"', async () => {
    mockSql.mockResolvedValueOnce([] as never)
    const r = await requireGroupMember(BigInt(-100123), 99)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.response.status).toBe(404)
      expect(await r.response.json()).toEqual({ error: 'Group not found' })
    }
  })

  it('a group the caller does not belong to: 403 "Forbidden", not 404', async () => {
    mockSql.mockResolvedValueOnce([{ id: 5, title: 'Tokyo', currency: 'JPY', member_id: null }] as never)
    const r = await requireGroupMember(BigInt(-100123), 99)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.response.status).toBe(403)
      expect(await r.response.json()).toEqual({ error: 'Forbidden' })
    }
  })

  it('a missing member_id (never a truthy default) is treated as not a member', async () => {
    mockSql.mockResolvedValueOnce([{ id: 5, title: 'T', currency: 'SGD' }] as never)
    const r = await requireGroupMember(BigInt(1), 99)
    expect(r.ok).toBe(false)
  })

  it('member id 0 would still count as a member (only null/undefined means no)', async () => {
    mockSql.mockResolvedValueOnce([{ id: 5, title: 'T', currency: 'SGD', member_id: 0 }] as never)
    expect((await requireGroupMember(BigInt(1), 99)).ok).toBe(true)
  })

  it('issues exactly one query, with the member matched on this group and this Telegram user, values bound', async () => {
    mockSql.mockResolvedValueOnce([] as never)
    await requireGroupMember(BigInt(-100123), 99)
    expect(mockSql).toHaveBeenCalledTimes(1)
    const text = (mockSql.mock.calls[0]![0] as unknown as string[]).join('?').replace(/\s+/g, ' ')
    expect(text).toMatch(/FROM groups g LEFT JOIN members m ON m\.group_id = g\.id AND m\.telegram_user_id = \?/)
    expect(text).toMatch(/WHERE g\.chat_id = \? AND g\.deleted_at IS NULL/)
    expect(mockSql.mock.calls[0]!.slice(1)).toEqual([99, BigInt(-100123)])
  })
})
