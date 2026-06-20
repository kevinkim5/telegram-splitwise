import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))
vi.mock('@/lib/group-member', () => ({ getGroupMember: vi.fn() }))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { getGroupMember } from '@/lib/group-member'
import { validateGroupMembers } from '../validate-group-members'
import { POST as expensePOST } from '../../app/api/groups/[chatId]/expenses/route'
import { PUT as expensePUT } from '../../app/api/groups/[chatId]/expenses/[id]/route'
import { POST as settlementPOST } from '../../app/api/groups/[chatId]/settlements/route'

const mockSql = vi.mocked(sql)
const mockGetAuthUser = vi.mocked(getAuthUser)
const mockGetGroupMember = vi.mocked(getGroupMember)

function makeRequest(body: object, url = 'http://localhost/'): Request {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ─── Unit tests for validateGroupMembers ─────────────────────────────────────

describe('validateGroupMembers', () => {
  it('returns true when all IDs belong to the group', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }])
    expect(await validateGroupMembers(10, [1, 2, 3])).toBe(true)
  })

  it('returns false when one ID is from a different group', async () => {
    mockSql.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]) // only 2 found, 3rd is foreign
    expect(await validateGroupMembers(10, [1, 2, 99])).toBe(false)
  })

  it('returns false when no IDs are found', async () => {
    mockSql.mockResolvedValueOnce([])
    expect(await validateGroupMembers(10, [99, 100])).toBe(false)
  })

  it('deduplicates IDs before querying — paid_by also in splits is fine', async () => {
    // IDs [1, 2, 1] → unique [1, 2] → 2 found → true
    mockSql.mockResolvedValueOnce([{ id: 1 }, { id: 2 }])
    expect(await validateGroupMembers(10, [1, 2, 1])).toBe(true)
  })

  it('returns true for empty list without hitting the DB', async () => {
    expect(await validateGroupMembers(10, [])).toBe(true)
    expect(mockSql).not.toHaveBeenCalled()
  })
})

// ─── Route: POST /api/groups/[chatId]/expenses ────────────────────────────────

describe('POST /api/groups/[chatId]/expenses — member ID validation', () => {
  const params = Promise.resolve({ chatId: '123' })

  const validBody = {
    description: 'Dinner',
    total_amount: 30,
    paid_by_member_id: 1,
    split_type: 'equal',
    splits: [{ member_id: 1 }, { member_id: 2 }],
  }

  it('returns 422 when paid_by_member_id is from a different group', async () => {
    mockGetAuthUser.mockReturnValue({ id: 99, first_name: 'Alice' })
    mockSql.mockResolvedValueOnce([{ id: 7, currency: 'SGD' }]) // group found
    mockGetGroupMember.mockResolvedValueOnce({ id: 5 })          // user is a member
    mockSql.mockResolvedValueOnce([{ id: 2 }])                   // only 1 of 2 unique IDs found → invalid

    const res = await expensePOST(makeRequest(validBody), { params })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/member IDs do not belong/)
  })

  it('returns 422 when a split member_id is from a different group', async () => {
    mockGetAuthUser.mockReturnValue({ id: 99, first_name: 'Alice' })
    mockSql.mockResolvedValueOnce([{ id: 7, currency: 'SGD' }])
    mockGetGroupMember.mockResolvedValueOnce({ id: 5 })
    mockSql.mockResolvedValueOnce([{ id: 1 }]) // only paid_by found; split member 2 is foreign

    const res = await expensePOST(makeRequest(validBody), { params })
    expect(res.status).toBe(422)
  })

  it('creates expense when all member IDs belong to the group', async () => {
    mockGetAuthUser.mockReturnValue({ id: 99, first_name: 'Alice' })
    mockSql
      .mockResolvedValueOnce([{ id: 7, currency: 'SGD' }])  // group
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])        // validateGroupMembers → both found
      .mockResolvedValueOnce([{ id: 55 }])                   // INSERT expense CTE
      .mockResolvedValueOnce([{ id: 55, description: 'Dinner', group_id: 7 }]) // getExpenseWithSplits
      .mockResolvedValueOnce([])                             // splits query
    mockGetGroupMember.mockResolvedValueOnce({ id: 5 })

    const res = await expensePOST(makeRequest(validBody), { params })
    expect(res.status).toBe(201)
  })
})

// ─── Route: PUT /api/groups/[chatId]/expenses/[id] ───────────────────────────

describe('PUT /api/groups/[chatId]/expenses/[id] — member ID validation', () => {
  const params = Promise.resolve({ chatId: '123', id: '55' })

  const validBody = {
    description: 'Dinner edited',
    total_amount: 40,
    paid_by_member_id: 1,
    split_type: 'equal',
    splits: [{ member_id: 1 }, { member_id: 2 }],
  }

  function makePutRequest(body: object): Request {
    return new Request('http://localhost/', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  }

  it('returns 422 when a member ID is from a different group', async () => {
    mockGetAuthUser.mockReturnValue({ id: 99, first_name: 'Alice' })
    mockSql
      .mockResolvedValueOnce([{ id: 7, currency: 'SGD' }])            // group
      .mockResolvedValueOnce([{ id: 55, currency: 'SGD', date: '2024-01-01' }]) // existing expense
      .mockResolvedValueOnce([{ id: 1 }])                              // validateGroupMembers → only 1 found
    mockGetGroupMember.mockResolvedValueOnce({ id: 5 })

    const res = await expensePUT(makePutRequest(validBody), { params })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/member IDs do not belong/)
  })
})

// ─── Route: POST /api/groups/[chatId]/settlements ────────────────────────────

describe('POST /api/groups/[chatId]/settlements — member ID validation', () => {
  const params = Promise.resolve({ chatId: '123' })

  const validBody = { from_member_id: 1, to_member_id: 2, amount: 15 }

  it('returns 422 when from_member_id is from a different group', async () => {
    mockGetAuthUser.mockReturnValue({ id: 99, first_name: 'Alice' })
    mockSql
      .mockResolvedValueOnce([{ id: 7, currency: 'SGD' }])  // group
      .mockResolvedValueOnce([{ id: 2 }])                    // validateGroupMembers → only to_member found
    mockGetGroupMember.mockResolvedValueOnce({ id: 5 })

    const res = await settlementPOST(makeRequest(validBody), { params })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toMatch(/member IDs do not belong/)
  })

  it('returns 422 when to_member_id is from a different group', async () => {
    mockGetAuthUser.mockReturnValue({ id: 99, first_name: 'Alice' })
    mockSql
      .mockResolvedValueOnce([{ id: 7, currency: 'SGD' }])
      .mockResolvedValueOnce([{ id: 1 }])  // only from_member found
    mockGetGroupMember.mockResolvedValueOnce({ id: 5 })

    const res = await settlementPOST(makeRequest(validBody), { params })
    expect(res.status).toBe(422)
  })

  it('creates settlement when both member IDs belong to the group', async () => {
    mockGetAuthUser.mockReturnValue({ id: 99, first_name: 'Alice' })
    mockSql
      .mockResolvedValueOnce([{ id: 7, currency: 'SGD' }])           // group
      .mockResolvedValueOnce([{ id: 1 }, { id: 2 }])                  // validateGroupMembers → both found
      .mockResolvedValueOnce([{ id: 88 }])                             // INSERT RETURNING
      .mockResolvedValueOnce([{ id: 88, from_name: 'Alice', to_name: 'Bob', amount: 15 }])
    mockGetGroupMember.mockResolvedValueOnce({ id: 5 })

    const res = await settlementPOST(makeRequest(validBody), { params })
    expect(res.status).toBe(201)
  })
})
