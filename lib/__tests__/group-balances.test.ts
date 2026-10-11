import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/sql', () => {
  const sql: any = vi.fn()
  sql.transaction = vi.fn()
  return { sql }
})

import { sql } from '@/lib/sql'
import { buildLedger, loadLedger, loadSimplifiedDebts, netCents, type ExpensePair, type LedgerMember, type SettlementPair } from '../group-balances'

import { legacy, type SettlementRow, type SplitRow } from './helpers/legacy-balances'

// What the database's GROUP BY hands back for the same rows
function aggregate(splits: Array<SplitRow & { expenseId: number }>, settlements: Array<SettlementRow & { id: number }>) {
  const ex = new Map<string, ExpensePair>()
  for (const r of splits) {
    if (r.paid_by_member_id === r.member_id) continue
    const k = `${r.currency}|${r.paid_by_member_id}|${r.member_id}`
    const cents = Math.round(parseFloat(r.amount) * 100)
    const cur = ex.get(k)
    if (cur) { cur.cents += cents; cur.firstId = Math.min(cur.firstId, r.expenseId) }
    else ex.set(k, { currency: r.currency, payer: r.paid_by_member_id, member: r.member_id, cents, firstId: r.expenseId })
  }
  const st = new Map<string, SettlementPair>()
  for (const r of settlements) {
    const k = `${r.currency}|${r.from_member_id}|${r.to_member_id}`
    const cents = Math.round(parseFloat(r.amount) * 100)
    const cur = st.get(k)
    if (cur) { cur.cents += cents; cur.firstId = Math.min(cur.firstId, r.id) }
    else st.set(k, { currency: r.currency, from: r.from_member_id, to: r.to_member_id, cents, firstId: r.id })
  }
  // the database returns groups in no particular order: shuffle to prove the result does not depend on it
  const shuffled = <T,>(a: T[]) => [...a].sort((x, y) => (JSON.stringify(x) < JSON.stringify(y) ? 1 : -1))
  return { expenses: shuffled([...ex.values()]), settlements: shuffled([...st.values()]) }
}

// small deterministic PRNG so a failure can be reproduced from its seed
function rng(seed: number) {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}
const money = (cents: number) => (cents / 100).toFixed(2)

function scenario(seed: number) {
  const r = rng(seed)
  const int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1))
  const nMembers = int(2, 8)
  let id = int(1, 20)
  const members: LedgerMember[] = Array.from({ length: nMembers }, (_, i) => {
    id += int(1, 5)
    return { id, first_name: `M${i}`, last_name: r() < 0.4 ? `L${i}` : null }
  })
  const currencies = ['SGD', 'JPY', 'THB', 'USD', 'EUR'].slice(0, int(1, 5))
  const splits: Array<SplitRow & { expenseId: number }> = []
  const nExpenses = int(0, 40)
  for (let e = 1; e <= nExpenses; e++) {
    const currency = currencies[int(0, currencies.length - 1)]
    const payer = members[int(0, nMembers - 1)].id
    const who = members.filter(() => r() < 0.6)
    if (who.length === 0) who.push(members[int(0, nMembers - 1)])
    const total = int(1, 500000) // cents
    // equal split with the remainder on the last person, or arbitrary custom amounts: both occur in the app
    const custom = r() < 0.4
    let left = total
    who.forEach((m, i) => {
      const share = custom ? int(0, Math.max(0, Math.floor(total / 2))) : (i === who.length - 1 ? left : Math.floor(total / who.length))
      left -= custom ? 0 : share
      splits.push({ expenseId: e, paid_by_member_id: payer, currency, member_id: m.id, amount: money(share) })
    })
  }
  const settlements: Array<SettlementRow & { id: number }> = []
  for (let s = 1; s <= int(0, 10); s++) {
    const a = members[int(0, nMembers - 1)].id
    let b = members[int(0, nMembers - 1)].id
    if (b === a) b = members.find(m => m.id !== a)!.id
    settlements.push({ id: s, from_member_id: a, to_member_id: b, amount: money(int(1, 200000)), currency: currencies[int(0, currencies.length - 1)] })
  }
  return { members, splits, settlements, groupCurrency: currencies[0] }
}

describe('balance calculation: new cents-in-SQL version equals the old float version', () => {
  it('gives identical balances, per-currency balances and simplified debts on 4000 random groups', () => {
    for (let seed = 1; seed <= 4000; seed++) {
      const sc = scenario(seed)
      const expected = legacy(sc.members, sc.splits, sc.settlements, sc.groupCurrency)
      const agg = aggregate(sc.splits, sc.settlements)
      const actual = buildLedger(sc.members, agg.expenses, agg.settlements, sc.groupCurrency)
      // toEqual on the whole result: names, order of members, order of currencies, every amount, every debt
      expect(actual, `seed ${seed}`).toEqual(expected)
    }
  })

  it('every currency still nets to zero across the group (nothing created or lost)', () => {
    for (let seed = 1; seed <= 1000; seed++) {
      const sc = scenario(seed)
      const agg = aggregate(sc.splits, sc.settlements)
      for (const [, byMember] of netCents(sc.members.map(m => m.id), agg.expenses, agg.settlements)) {
        expect([...byMember.values()].reduce((a, b) => a + b, 0), `seed ${seed}`).toBe(0)
      }
    }
  })

  it('applying the simplified debts as settlements clears every balance', () => {
    for (let seed = 1; seed <= 500; seed++) {
      const sc = scenario(seed)
      const agg = aggregate(sc.splits, sc.settlements)
      const first = buildLedger(sc.members, agg.expenses, agg.settlements, sc.groupCurrency)
      const paid: SettlementPair[] = first.simplified_debts.map((d, i) => ({ currency: d.currency, from: d.from_member_id, to: d.to_member_id, cents: Math.round(d.amount * 100), firstId: 9000 + i }))
      const after = buildLedger(sc.members, agg.expenses, [...agg.settlements, ...paid], sc.groupCurrency)
      expect(after.simplified_debts, `seed ${seed}`).toEqual([])
    }
  })
})

describe('buildLedger edge cases', () => {
  const kev = { id: 7, first_name: 'Kev', last_name: null }
  const ann = { id: 8, first_name: 'Ann', last_name: 'Lee' }
  const pair = (currency: string, payer: number, member: number, cents: number, firstId = 1): ExpensePair => ({ currency, payer, member, cents, firstId })

  it('no activity: everyone at zero, no currencies, no debts', () => {
    expect(buildLedger([kev, ann], [], [], 'SGD')).toEqual({
      balances: [{ member_id: 7, member_name: 'Kev', net_amount: 0, currency: 'SGD' }, { member_id: 8, member_name: 'Ann Lee', net_amount: 0, currency: 'SGD' }],
      balances_by_currency: {}, simplified_debts: [],
    })
  })
  it('a payer\'s own share never creates a currency or a debt', () => {
    const l = buildLedger([kev, ann], [pair('JPY', 7, 7, 5000)], [], 'SGD')
    expect(l.balances_by_currency).toEqual({})
    expect(l.simplified_debts).toEqual([])
  })
  it('a currency that nets to zero is still listed, with no debts', () => {
    const l = buildLedger([kev, ann], [pair('SGD', 7, 8, 1000), pair('SGD', 8, 7, 1000, 2)], [], 'SGD')
    expect(Object.keys(l.balances_by_currency)).toEqual(['SGD'])
    expect(l.simplified_debts).toEqual([])
  })
  it('a settlement-only currency is listed after the expense currencies', () => {
    const l = buildLedger([kev, ann], [pair('JPY', 7, 8, 1000, 5)], [{ currency: 'SGD', from: 8, to: 7, cents: 500, firstId: 1 }], 'SGD')
    expect(Object.keys(l.balances_by_currency)).toEqual(['JPY', 'SGD'])
  })
  it('currencies are ordered by the first expense that used them, whatever order rows arrive in', () => {
    const rows = [pair('THB', 7, 8, 100, 9), pair('SGD', 7, 8, 100, 2), pair('JPY', 7, 8, 100, 5)]
    expect(Object.keys(buildLedger([kev, ann], rows, [], 'SGD').balances_by_currency)).toEqual(['SGD', 'JPY', 'THB'])
    expect(Object.keys(buildLedger([kev, ann], [...rows].reverse(), [], 'SGD').balances_by_currency)).toEqual(['SGD', 'JPY', 'THB'])
  })
  it('amounts are exact to the cent (0.1 + 0.2 style float traps do not appear)', () => {
    const l = buildLedger([kev, ann], [pair('SGD', 7, 8, 10, 1), pair('SGD', 7, 8, 20, 2)], [], 'SGD')
    expect(l.balances_by_currency.SGD.find(b => b.member_id === 7)!.net_amount).toBe(0.3)
  })
  it('the header balance adds every currency together in the group currency', () => {
    const l = buildLedger([kev, ann], [pair('SGD', 7, 8, 1000), pair('JPY', 8, 7, 300, 2)], [], 'SGD')
    expect(l.balances).toEqual([{ member_id: 7, member_name: 'Kev', net_amount: 7, currency: 'SGD' }, { member_id: 8, member_name: 'Ann Lee', net_amount: -7, currency: 'SGD' }])
  })
})

describe('loadLedger', () => {
  const mockSql = vi.mocked(sql) as unknown as { (...a: unknown[]): unknown; transaction: ReturnType<typeof vi.fn> }
  beforeEach(() => { vi.clearAllMocks(); (mockSql as any).mockImplementation?.(() => ({})) })

  it('reads members, expense sums and settlement sums in ONE read-only repeatable-read transaction', async () => {
    const queries: string[] = []
    ;(sql as any).mockImplementation((strings: TemplateStringsArray, ...vals: unknown[]) => { queries.push(strings.join('?').replace(/\s+/g, ' ').trim() + ' |' + vals.join(',')); return { q: queries.length } })
    mockSql.transaction.mockResolvedValue([
      [{ id: 7, first_name: 'Kev', last_name: null }, { id: 8, first_name: 'Ann', last_name: null }],
      [{ currency: 'SGD', payer: 8, member: 7, cents: '1250', first_id: '3' }], // the driver returns bigint as a string
      [{ currency: 'SGD', from: 7, to: 8, cents: '250', first_id: '1' }],
    ])
    const l = await loadLedger(5, 'SGD')
    expect(mockSql.transaction).toHaveBeenCalledTimes(1)
    expect(mockSql.transaction.mock.calls[0]![0]).toHaveLength(3)
    expect(mockSql.transaction.mock.calls[0]![1]).toEqual({ isolationLevel: 'RepeatableRead', readOnly: true })
    expect(queries[0]).toMatch(/FROM members WHERE group_id = \? ORDER BY id \|5/)
    expect(queries[1]).toMatch(/e\.deleted_at IS NULL AND es\.member_id <> e\.paid_by_member_id/)
    expect(queries[1]).toMatch(/GROUP BY e\.currency, e\.paid_by_member_id, es\.member_id \|5$|\|5$/)
    expect(queries[2]).toMatch(/FROM settlements WHERE group_id = \? AND deleted_at IS NULL/)
    // Kev owes Ann 12.50, has paid her back 2.50 -> owes 10.00
    expect(l.simplified_debts).toEqual([{ from_member_id: 7, from_name: 'Kev', to_member_id: 8, to_name: 'Ann', amount: 10, currency: 'SGD' }])
  })

  it('loadSimplifiedDebts is the same calculation', async () => {
    ;(sql as any).mockImplementation(() => ({}))
    mockSql.transaction.mockResolvedValue([
      [{ id: 7, first_name: 'Kev', last_name: null }, { id: 8, first_name: 'Ann', last_name: null }],
      [{ currency: 'JPY', payer: 8, member: 7, cents: '300000', first_id: 1 }],
      [],
    ])
    expect(await loadSimplifiedDebts(5)).toEqual([{ from_member_id: 7, from_name: 'Kev', to_member_id: 8, to_name: 'Ann', amount: 3000, currency: 'JPY' }])
  })
})
