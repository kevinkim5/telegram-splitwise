import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock sql before importing anything that uses it
vi.mock('@/lib/sql', () => ({
  sql: vi.fn(),
}))
vi.mock('@/lib/auth', () => ({
  getAuthUser: vi.fn(),
}))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '../group-member'
import { GET as membersGET } from '../../app/api/groups/[chatId]/members/route'
import { DELETE as expenseDELETE } from '../../app/api/groups/[chatId]/expenses/[id]/route'

const mockSql = vi.mocked(sql)
const mockGetAuthUser = vi.mocked(getAuthUser)

function makeRequest(url = 'http://localhost/api/groups/123/members'): Request {
  return new Request(url)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Unit tests for getGroupMember ────────────────────────────────────────────

describe('getGroupMember', () => {
  it('returns member object when user is a member of the group', async () => {
    mockSql.mockResolvedValueOnce([{ id: 42 }])
    const result = await getGroupMember(1, 123)
    expect(result).toEqual({ id: 42 })
  })

  it('returns null when user is not a member of the group', async () => {
    mockSql.mockResolvedValueOnce([])
    const result = await getGroupMember(1, 999)
    expect(result).toBeNull()
  })

  it('returns null when group does not exist (empty result)', async () => {
    mockSql.mockResolvedValueOnce([])
    const result = await getGroupMember(9999, 123)
    expect(result).toBeNull()
  })
})

// ─── Route: GET /api/groups/[chatId]/members ──────────────────────────────────

describe('GET /api/groups/[chatId]/members', () => {
  const params = Promise.resolve({ chatId: '123' })

  it('returns 401 when not authenticated', async () => {
    mockGetAuthUser.mockReturnValue(null)

    const res = await membersGET(makeRequest(), { params })
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ error: 'Unauthorized' })
  })

  it('returns 404 when group does not exist', async () => {
    mockGetAuthUser.mockReturnValue({ id: 1, first_name: 'Alice' })
    mockSql.mockResolvedValueOnce([]) // group lookup → not found

    const res = await membersGET(makeRequest(), { params })
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'Group not found' })
  })

  it('returns 403 when authenticated user is not a member of the group', async () => {
    mockGetAuthUser.mockReturnValue({ id: 999, first_name: 'Outsider' })
    mockSql
      .mockResolvedValueOnce([{ id: 7 }])  // group found
      .mockResolvedValueOnce([])            // getGroupMember → not a member

    const res = await membersGET(makeRequest(), { params })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('returns 200 with members list when user is a member', async () => {
    mockGetAuthUser.mockReturnValue({ id: 1, first_name: 'Alice' })
    mockSql
      .mockResolvedValueOnce([{ id: 7 }])                     // group found
      .mockResolvedValueOnce([{ id: 3 }])                     // getGroupMember → member
      .mockResolvedValueOnce([                                  // members list
        { id: 3, first_name: 'Alice', last_name: null },
        { id: 4, first_name: 'Bob',   last_name: null },
      ])

    const res = await membersGET(makeRequest(), { params })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveLength(2)
    expect(body[0].first_name).toBe('Alice')
  })
})

// ─── Route: DELETE /api/groups/[chatId]/expenses/[id] ─────────────────────────

describe('DELETE /api/groups/[chatId]/expenses/[id]', () => {
  const params = Promise.resolve({ chatId: '123', id: '55' })

  it('returns 401 when not authenticated', async () => {
    mockGetAuthUser.mockReturnValue(null)

    const res = await expenseDELETE(makeRequest(), { params })
    expect(res.status).toBe(401)
  })

  it('returns 403 when authenticated user is not a member', async () => {
    mockGetAuthUser.mockReturnValue({ id: 999, first_name: 'Outsider' })
    mockSql
      .mockResolvedValueOnce([{ id: 7 }])  // group found
      .mockResolvedValueOnce([])            // getGroupMember → not a member

    const res = await expenseDELETE(makeRequest(), { params })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Forbidden' })
  })

  it('returns 404 when expense does not belong to the group', async () => {
    mockGetAuthUser.mockReturnValue({ id: 1, first_name: 'Alice' })
    mockSql
      .mockResolvedValueOnce([{ id: 7 }])  // group found
      .mockResolvedValueOnce([{ id: 3 }])  // getGroupMember → is a member
      .mockResolvedValueOnce([])            // expense lookup → not found

    const res = await expenseDELETE(makeRequest(), { params })
    expect(res.status).toBe(404)
  })

  it('soft-deletes expense and returns ok when user is a member', async () => {
    mockGetAuthUser.mockReturnValue({ id: 1, first_name: 'Alice' })
    mockSql
      .mockResolvedValueOnce([{ id: 7 }])    // group found
      .mockResolvedValueOnce([{ id: 3 }])    // getGroupMember → is a member
      .mockResolvedValueOnce([{ id: 55 }])   // expense exists
    // soft delete + "deleted" activity entry run as one transaction
    const tx = vi.fn().mockResolvedValue([])
    ;(sql as unknown as { transaction: unknown }).transaction = tx

    const res = await expenseDELETE(makeRequest(), { params })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(tx).toHaveBeenCalledTimes(1)
    expect((tx.mock.calls[0][0] as unknown[]).length).toBe(2)
  })
})
