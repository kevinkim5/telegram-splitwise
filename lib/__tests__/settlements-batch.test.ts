import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sql', () => ({ sql: vi.fn() }))
vi.mock('@/lib/auth', () => ({ getAuthUser: vi.fn() }))

import { sql } from '@/lib/sql'
import { getAuthUser } from '@/lib/auth'
import { POST } from '../../app/api/groups/[chatId]/settlements/batch/route'
import { loadSimplifiedDebts } from '@/lib/group-debts'

const mockSql = vi.mocked(sql)
const mockGetAuthUser = vi.mocked(getAuthUser)

const ME = 7, ANN = 8, BEN = 9
const props = { params: Promise.resolve({ chatId: '-100123' }) }

// Group of Kev(7), Ann(8), Ben(9). Kev owes Ann JPY 3000 and USD 18.50; Ann owes Kev SGD 10.
// Built from expenses so the real debt calculation runs: payer Ann/Ben are owed by Kev, etc.
let expenseRows: Array<Record<string, unknown>>
let settlementRows: Array<Record<string, unknown>>
let memberRowsForValidation: number[]
let insertValues: unknown[][]
let isMember: boolean

const split = (payer: number, member: number, amount: number, currency: string) =>
  ({ paid_by_member_id: payer, member_id: member, amount: String(amount), currency })

function routeSql() {
  insertValues = []
  mockSql.mockImplementation(((strings: TemplateStringsArray, ...vals: unknown[]) => {
    const q = strings.join('?').replace(/\s+/g, ' ').trim()
    if (/^SELECT id FROM groups WHERE chat_id/.test(q)) return Promise.resolve([{ id: 5 }])
    if (/^SELECT id FROM members WHERE group_id = \? AND telegram_user_id/.test(q)) return Promise.resolve(isMember ? [{ id: ME }] : [])
    if (/^SELECT id FROM members WHERE group_id = \? AND id = ANY/.test(q)) {
      const ids = vals[1] as number[]
      return Promise.resolve(ids.filter(i => memberRowsForValidation.includes(i)).map(id => ({ id })))
    }
    if (/^SELECT id, first_name, last_name FROM members/.test(q)) {
      return Promise.resolve([{ id: ME, first_name: 'Kev' }, { id: ANN, first_name: 'Ann' }, { id: BEN, first_name: 'Ben' }])
    }
    if (/FROM expenses e JOIN expense_splits/.test(q)) return Promise.resolve(expenseRows)
    if (/^SELECT from_member_id, to_member_id, amount, currency FROM settlements/.test(q)) return Promise.resolve(settlementRows)
    if (/^INSERT INTO settlements/.test(q)) {
      insertValues.push(vals)
      return Promise.resolve([{ id: 1 }, { id: 2 }])
    }
    return Promise.resolve([])
  }) as never)
}

const post = (body: unknown) =>
  POST(new Request('http://x/api/groups/-100123/settlements/batch', { method: 'POST', body: JSON.stringify(body) }), props)
const pay = (to: number, amount: number, currency: string) => ({ from_member_id: ME, to_member_id: to, amount, currency })
const inserted = () => insertValues.length > 0

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuthUser.mockReturnValue({ id: 99, first_name: 'Kev' } as never)
  isMember = true
  memberRowsForValidation = [ME, ANN, BEN]
  // Ann paid 3000 JPY for Kev alone, 18.50 USD for Kev alone; Kev paid 10 SGD for Ann alone
  expenseRows = [split(ANN, ME, 3000, 'JPY'), split(ANN, ME, 18.5, 'USD'), split(ME, ANN, 10, 'SGD')]
  settlementRows = []
  routeSql()
})

describe('loadSimplifiedDebts', () => {
  it('computes who owes whom per currency, net of earlier settlements', async () => {
    settlementRows = [{ from_member_id: ME, to_member_id: ANN, amount: '1000', currency: 'JPY' }]
    const debts = await loadSimplifiedDebts(5)
    const find = (from: number, to: number, cur: string) => debts.find(d => d.from_member_id === from && d.to_member_id === to && d.currency === cur)
    expect(find(ME, ANN, 'JPY')?.amount).toBe(2000)
    expect(find(ME, ANN, 'USD')?.amount).toBe(18.5)
    expect(find(ANN, ME, 'SGD')?.amount).toBe(10)
  })
})

describe('POST /settlements/batch', () => {
  it('records several currencies in one statement and returns 201', async () => {
    const res = await post({ settlements: [pay(ANN, 3000, 'JPY'), pay(ANN, 18.5, 'USD')] })
    expect(res.status).toBe(201)
    expect(insertValues).toHaveLength(1) // one INSERT for all currencies = atomic
    const [group, froms, tos, amounts, currencies] = insertValues[0]!
    expect(group).toBe(5)
    expect(froms).toEqual([ME, ME]); expect(tos).toEqual([ANN, ANN])
    expect(amounts).toEqual([3000, 18.5]); expect(currencies).toEqual(['JPY', 'USD'])
  })

  it('accepts a part-payment and a payment in the other direction', async () => {
    const res = await post({ settlements: [pay(ANN, 1500, 'JPY'), { from_member_id: ANN, to_member_id: ME, amount: 10, currency: 'SGD' }] })
    expect(res.status).toBe(201)
    expect(insertValues[0]![3]).toEqual([1500, 10])
  })

  it('refuses to record more than is owed (checked on the server), saving nothing', async () => {
    const res = await post({ settlements: [pay(ANN, 3000, 'JPY'), pay(ANN, 18.51, 'USD')] })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/USD amount is out of date/)
    expect(inserted()).toBe(false) // the valid JPY row is not saved either
  })

  it('refuses a currency that is not owed at all, or one owed the other way', async () => {
    expect((await post({ settlements: [pay(ANN, 5, 'THB')] })).status).toBe(409)
    expect((await post({ settlements: [pay(ANN, 5, 'SGD')] })).status).toBe(409) // Ann owes Kev SGD, not the reverse
    expect(inserted()).toBe(false)
  })

  it('refuses once the debt has already been settled by someone else', async () => {
    settlementRows = [{ from_member_id: ME, to_member_id: ANN, amount: '3000', currency: 'JPY' }]
    expect((await post({ settlements: [pay(ANN, 100, 'JPY')] })).status).toBe(409)
  })

  it('allows the last cent of rounding tolerance but no more', async () => {
    expect((await post({ settlements: [pay(ANN, 18.5, 'USD')] })).status).toBe(201)
  })

  it('rejects duplicate currencies in one batch', async () => {
    const res = await post({ settlements: [pay(ANN, 100, 'JPY'), pay(ANN, 200, 'JPY')] })
    expect(res.status).toBe(422)
    expect(inserted()).toBe(false)
  })

  it('only lets you record payments that involve you', async () => {
    const res = await post({ settlements: [{ from_member_id: ANN, to_member_id: BEN, amount: 5, currency: 'SGD' }] })
    expect(res.status).toBe(403)
    expect(inserted()).toBe(false)
  })

  it('rejects paying yourself and members from another group', async () => {
    expect((await post({ settlements: [pay(ME, 5, 'SGD')] })).status).toBe(422)
    memberRowsForValidation = [ME] // Ann not in this group
    expect((await post({ settlements: [pay(ANN, 5, 'JPY')] })).status).toBe(422)
  })

  it('validates the request body', async () => {
    expect((await post({ settlements: [] })).status).toBe(422)
    expect((await post({})).status).toBe(422)
    expect((await post({ settlements: [pay(ANN, -5, 'JPY')] })).status).toBe(422)
    expect((await post({ settlements: [pay(ANN, 5, 'jpy')] })).status).toBe(422)
    expect((await post({ settlements: [{ from_member_id: ME, to_member_id: ANN, amount: 5 }] })).status).toBe(422) // currency required
    expect((await post({ settlements: Array.from({ length: 21 }, (_, i) => pay(ANN, 1, 'AB' + String.fromCharCode(65 + i))) })).status).toBe(422)
    const bad = await POST(new Request('http://x', { method: 'POST', body: 'not json' }), props)
    expect(bad.status).toBe(400)
  })

  it('requires login and group membership', async () => {
    mockGetAuthUser.mockReturnValue(null)
    expect((await post({ settlements: [pay(ANN, 5, 'JPY')] })).status).toBe(401)
    mockGetAuthUser.mockReturnValue({ id: 99, first_name: 'Kev' } as never)
    isMember = false
    expect((await post({ settlements: [pay(ANN, 5, 'JPY')] })).status).toBe(403)
    expect(inserted()).toBe(false)
  })
})
