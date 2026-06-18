/**
 * End-to-end balance scenario tests.
 *
 * computeNetBalances is a pure mirror of the aggregation logic in
 * app/api/groups/[chatId]/balances/route.ts — it lets us verify financial
 * correctness without a database.
 */
import { describe, it, expect } from 'vitest'
import { simplifyDebts, type NamedBalance } from '../balances'
import { computeEqualSplits } from '../splits'

type SplitRow = { paid_by_member_id: number; currency: string; member_id: number; amount: number }
type SettlementRow = { from_member_id: number; to_member_id: number; amount: number; currency: string }

function computeNetBalances(
  memberIds: number[],
  splits: SplitRow[],
  settlements: SettlementRow[] = []
): Map<string, Map<number, number>> {
  const netByCurrency = new Map<string, Map<number, number>>()

  const getOrInit = (currency: string) => {
    if (!netByCurrency.has(currency)) {
      netByCurrency.set(currency, new Map(memberIds.map(id => [id, 0])))
    }
    return netByCurrency.get(currency)!
  }

  for (const r of splits) {
    if (r.paid_by_member_id !== r.member_id) {
      const map = getOrInit(r.currency)
      map.set(r.paid_by_member_id, (map.get(r.paid_by_member_id) ?? 0) + r.amount)
      map.set(r.member_id, (map.get(r.member_id) ?? 0) - r.amount)
    }
  }

  for (const r of settlements) {
    const map = getOrInit(r.currency)
    map.set(r.from_member_id, (map.get(r.from_member_id) ?? 0) + r.amount)
    map.set(r.to_member_id, (map.get(r.to_member_id) ?? 0) - r.amount)
  }

  return netByCurrency
}

function net(balances: Map<string, Map<number, number>>, currency: string, memberId: number): number {
  return Math.round((balances.get(currency)?.get(memberId) ?? 0) * 100) / 100
}

function toNamedBalances(
  balances: Map<string, Map<number, number>>,
  currency: string,
  names: Record<number, string>
): NamedBalance[] {
  return [...(balances.get(currency)?.entries() ?? [])].map(([id, amt]) => ({
    member_id: id,
    member_name: names[id] ?? `Member${id}`,
    net_amount: Math.round(amt * 100) / 100,
    currency,
  }))
}

const ALICE = 1, BOB = 2, CAROL = 3, DAVE = 4
const NAMES: Record<number, string> = { 1: 'Alice', 2: 'Bob', 3: 'Carol', 4: 'Dave' }

// ─── Net balance computation ───────────────────────────────────────────────

describe('computeNetBalances', () => {
  it('no expenses: produces no currency maps', () => {
    expect(computeNetBalances([ALICE, BOB], []).size).toBe(0)
  })

  it("payer's own split row creates no self-debt", () => {
    const splits: SplitRow[] = [
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: ALICE, amount: 5 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB, amount: 5 },
    ]
    const r = computeNetBalances([ALICE, BOB], splits)
    expect(net(r, 'SGD', ALICE)).toBe(5)
    expect(net(r, 'SGD', BOB)).toBe(-5)
  })

  it('three-way equal split: payer is owed both other shares', () => {
    const splits = computeEqualSplits(90, [ALICE, BOB, CAROL])
      .map(s => ({ paid_by_member_id: ALICE, currency: 'SGD', ...s }))
    const r = computeNetBalances([ALICE, BOB, CAROL], splits)
    expect(net(r, 'SGD', ALICE)).toBe(60)
    expect(net(r, 'SGD', BOB)).toBe(-30)
    expect(net(r, 'SGD', CAROL)).toBe(-30)
  })

  it('net balances always sum to zero per currency (conservation law)', () => {
    const splits: SplitRow[] = [
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB, amount: 33.33 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: CAROL, amount: 33.33 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: ALICE, amount: 33.34 },
      { paid_by_member_id: BOB,   currency: 'SGD', member_id: CAROL, amount: 12.50 },
      { paid_by_member_id: BOB,   currency: 'SGD', member_id: BOB,   amount: 12.50 },
    ]
    const r = computeNetBalances([ALICE, BOB, CAROL], splits)
    const sum = [...r.get('SGD')!.values()].reduce((a, b) => a + b, 0)
    expect(Math.abs(sum)).toBeLessThan(0.001)
  })

  it('full settlement clears debt to zero', () => {
    const splits: SplitRow[] = [
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: ALICE, amount: 15 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB, amount: 15 },
    ]
    const r = computeNetBalances([ALICE, BOB], splits, [
      { from_member_id: BOB, to_member_id: ALICE, amount: 15, currency: 'SGD' },
    ])
    expect(net(r, 'SGD', ALICE)).toBe(0)
    expect(net(r, 'SGD', BOB)).toBe(0)
  })

  it('partial settlement reduces remaining debt', () => {
    const splits: SplitRow[] = [
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: ALICE, amount: 15 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB, amount: 15 },
    ]
    const r = computeNetBalances([ALICE, BOB], splits, [
      { from_member_id: BOB, to_member_id: ALICE, amount: 8, currency: 'SGD' },
    ])
    expect(net(r, 'SGD', ALICE)).toBe(7)
    expect(net(r, 'SGD', BOB)).toBe(-7)
  })

  it('multi-currency expenses are tracked in separate buckets', () => {
    const splits: SplitRow[] = [
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: ALICE, amount: 10 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB,   amount: 10 },
      { paid_by_member_id: BOB,   currency: 'EUR', member_id: BOB,   amount: 20 },
      { paid_by_member_id: BOB,   currency: 'EUR', member_id: CAROL, amount: 20 },
    ]
    const r = computeNetBalances([ALICE, BOB, CAROL], splits)
    expect(net(r, 'SGD', ALICE)).toBe(10)
    expect(net(r, 'SGD', BOB)).toBe(-10)
    expect(net(r, 'EUR', BOB)).toBe(20)
    expect(net(r, 'EUR', CAROL)).toBe(-20)
    // Alice has no EUR involvement
    expect(net(r, 'EUR', ALICE)).toBe(0)
  })

  it('settlement in a different currency does not clear the original debt', () => {
    const splits: SplitRow[] = [
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB, amount: 20 },
    ]
    // Bob pays Alice back in EUR — this should NOT clear the SGD debt
    const r = computeNetBalances([ALICE, BOB], splits, [
      { from_member_id: BOB, to_member_id: ALICE, amount: 20, currency: 'EUR' },
    ])
    expect(net(r, 'SGD', ALICE)).toBe(20)   // SGD debt untouched
    expect(net(r, 'SGD', BOB)).toBe(-20)
    expect(net(r, 'EUR', BOB)).toBe(20)     // EUR settlement recorded
    expect(net(r, 'EUR', ALICE)).toBe(-20)
  })

  it('multiple expenses accumulate correctly', () => {
    // Alice pays $30, Bob pays $15 for Carol
    const splits: SplitRow[] = [
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: ALICE, amount: 10 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB,   amount: 10 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: CAROL, amount: 10 },
      { paid_by_member_id: BOB,   currency: 'SGD', member_id: BOB,   amount: 7.5 },
      { paid_by_member_id: BOB,   currency: 'SGD', member_id: CAROL, amount: 7.5 },
    ]
    const r = computeNetBalances([ALICE, BOB, CAROL], splits)
    // Alice: +10(Bob) +10(Carol) = +20
    // Bob: -10(Alice) +7.5(Carol) = -2.5
    // Carol: -10(Alice) -7.5(Bob) = -17.5
    expect(net(r, 'SGD', ALICE)).toBe(20)
    expect(net(r, 'SGD', BOB)).toBe(-2.5)
    expect(net(r, 'SGD', CAROL)).toBe(-17.5)
  })
})

// ─── End-to-end scenarios ─────────────────────────────────────────────────

describe('end-to-end: group trip settle-up', () => {
  it('3 people, 3 expenses → minimal debts → settle fully → all zero', () => {
    // Alice pays $90 dinner (3-way), Bob pays $60 hotel (3-way), Carol pays $30 taxi (3-way)
    // Expected net: Alice +30, Bob 0, Carol -30
    const members = [ALICE, BOB, CAROL]
    const splits: SplitRow[] = [
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: ALICE, amount: 30 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB,   amount: 30 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: CAROL, amount: 30 },
      { paid_by_member_id: BOB,   currency: 'SGD', member_id: ALICE, amount: 20 },
      { paid_by_member_id: BOB,   currency: 'SGD', member_id: BOB,   amount: 20 },
      { paid_by_member_id: BOB,   currency: 'SGD', member_id: CAROL, amount: 20 },
      { paid_by_member_id: CAROL, currency: 'SGD', member_id: ALICE, amount: 10 },
      { paid_by_member_id: CAROL, currency: 'SGD', member_id: BOB,   amount: 10 },
      { paid_by_member_id: CAROL, currency: 'SGD', member_id: CAROL, amount: 10 },
    ]

    const r = computeNetBalances(members, splits)
    expect(net(r, 'SGD', ALICE)).toBe(30)
    expect(net(r, 'SGD', BOB)).toBe(0)
    expect(net(r, 'SGD', CAROL)).toBe(-30)

    // Simplify: Carol pays Alice $30 (one transaction)
    const debts = simplifyDebts(toNamedBalances(r, 'SGD', NAMES))
    expect(debts).toHaveLength(1)
    expect(debts[0]).toMatchObject({ from_member_id: CAROL, to_member_id: ALICE, amount: 30 })

    // Settle: everything should reach zero
    const r2 = computeNetBalances(members, splits, [
      { from_member_id: CAROL, to_member_id: ALICE, amount: 30, currency: 'SGD' },
    ])
    members.forEach(m => expect(net(r2, 'SGD', m)).toBe(0))
  })
})

describe('end-to-end: rounding across many people', () => {
  it('$10 split 3 ways sums exactly and balances are consistent', () => {
    const members = [ALICE, BOB, CAROL]
    const splits = computeEqualSplits(10, members)
    // Check exact sum
    expect(splits.reduce((s, r) => s + r.amount, 0)).toBe(10)

    const splitRows: SplitRow[] = splits.map(s => ({
      paid_by_member_id: ALICE,
      currency: 'SGD',
      ...s,
    }))
    const r = computeNetBalances(members, splitRows)

    // Alice is owed the other two shares combined
    const aliceOwed = net(r, 'SGD', ALICE)
    const bobOwes = Math.abs(net(r, 'SGD', BOB))
    const carolOwes = Math.abs(net(r, 'SGD', CAROL))
    expect(Math.round((aliceOwed - bobOwes - carolOwes) * 100)).toBe(0)
  })
})

describe('end-to-end: multi-currency debts stay independent', () => {
  it('SGD and EUR debts are each simplified independently', () => {
    // Alice owes Bob $20 SGD; Bob owes Alice €10 EUR
    const splits: SplitRow[] = [
      { paid_by_member_id: BOB,   currency: 'SGD', member_id: ALICE, amount: 20 },
      { paid_by_member_id: ALICE, currency: 'EUR', member_id: BOB,   amount: 10 },
    ]
    const r = computeNetBalances([ALICE, BOB], splits)

    const sgdDebts = simplifyDebts(toNamedBalances(r, 'SGD', NAMES))
    const eurDebts = simplifyDebts(toNamedBalances(r, 'EUR', NAMES))

    expect(sgdDebts).toHaveLength(1)
    expect(sgdDebts[0]).toMatchObject({ from_member_id: ALICE, to_member_id: BOB, amount: 20, currency: 'SGD' })

    expect(eurDebts).toHaveLength(1)
    expect(eurDebts[0]).toMatchObject({ from_member_id: BOB, to_member_id: ALICE, amount: 10, currency: 'EUR' })
  })
})

describe('end-to-end: 4 people even contributions → zero debts', () => {
  it('each person pays equally for all → no simplification needed', () => {
    const members = [ALICE, BOB, CAROL, DAVE]
    const allSplits: SplitRow[] = members.flatMap(payer =>
      members.map(member => ({ paid_by_member_id: payer, currency: 'SGD', member_id: member, amount: 10 }))
    )
    const r = computeNetBalances(members, allSplits)
    members.forEach(m => expect(net(r, 'SGD', m)).toBeCloseTo(0))
    expect(simplifyDebts(toNamedBalances(r, 'SGD', NAMES))).toHaveLength(0)
  })
})

// ─── Settlement editing ───────────────────────────────────────────────────

describe('settlement editing: correcting mistakes', () => {
  // Alice paid $50 for 2 people; Bob owes $50.
  const splits2: SplitRow[] = [
    { paid_by_member_id: ALICE, currency: 'SGD', member_id: ALICE, amount: 50 },
    { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB,   amount: 50 },
  ]

  it('over-payment: editing down to correct amount clears the debt', () => {
    // Bob accidentally records $60 (over-payment)
    const rWrong = computeNetBalances([ALICE, BOB], splits2, [
      { from_member_id: BOB, to_member_id: ALICE, amount: 60, currency: 'SGD' },
    ])
    expect(net(rWrong, 'SGD', ALICE)).toBe(-10) // Alice is now in the hole
    expect(net(rWrong, 'SGD', BOB)).toBe(10)

    // Edit: correct to $50
    const rFixed = computeNetBalances([ALICE, BOB], splits2, [
      { from_member_id: BOB, to_member_id: ALICE, amount: 50, currency: 'SGD' },
    ])
    expect(net(rFixed, 'SGD', ALICE)).toBe(0)
    expect(net(rFixed, 'SGD', BOB)).toBe(0)
    expect(simplifyDebts(toNamedBalances(rFixed, 'SGD', NAMES))).toHaveLength(0)
  })

  it('under-payment: residual debt equals the shortfall after edit', () => {
    // Bob records $30 (should be $50)
    const rWrong = computeNetBalances([ALICE, BOB], splits2, [
      { from_member_id: BOB, to_member_id: ALICE, amount: 30, currency: 'SGD' },
    ])
    expect(net(rWrong, 'SGD', ALICE)).toBe(20)
    expect(net(rWrong, 'SGD', BOB)).toBe(-20)

    // Edit: correct to $50
    const rFixed = computeNetBalances([ALICE, BOB], splits2, [
      { from_member_id: BOB, to_member_id: ALICE, amount: 50, currency: 'SGD' },
    ])
    expect(net(rFixed, 'SGD', ALICE)).toBe(0)
    expect(net(rFixed, 'SGD', BOB)).toBe(0)
  })

  it('wrong direction: from/to swap doubles the apparent debt', () => {
    // Alice paid $60 for a 3-way split → Alice +40, Bob -20, Carol -20
    const splits3: SplitRow[] = [
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: ALICE, amount: 20 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB,   amount: 20 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: CAROL, amount: 20 },
    ]
    const members = [ALICE, BOB, CAROL]

    // Bob records in wrong direction (Alice→Bob instead of Bob→Alice)
    const rWrong = computeNetBalances(members, splits3, [
      { from_member_id: ALICE, to_member_id: BOB, amount: 20, currency: 'SGD' },
    ])
    expect(net(rWrong, 'SGD', ALICE)).toBe(60)  // +40 + 20 (made things worse)
    expect(net(rWrong, 'SGD', BOB)).toBe(-40)   // -20 - 20

    // Edit: correct direction (Bob→Alice)
    const rFixed = computeNetBalances(members, splits3, [
      { from_member_id: BOB, to_member_id: ALICE, amount: 20, currency: 'SGD' },
    ])
    expect(net(rFixed, 'SGD', ALICE)).toBe(20)
    expect(net(rFixed, 'SGD', BOB)).toBe(0)
    expect(net(rFixed, 'SGD', CAROL)).toBe(-20)

    const debts = simplifyDebts(toNamedBalances(rFixed, 'SGD', NAMES))
    expect(debts).toHaveLength(1)
    expect(debts[0]).toMatchObject({ from_member_id: CAROL, to_member_id: ALICE, amount: 20 })
  })

  it('wrong currency: SGD debt persists when settlement is recorded in EUR', () => {
    const splits: SplitRow[] = [
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB, amount: 30 },
    ]

    // Bob records in wrong currency
    const rWrong = computeNetBalances([ALICE, BOB], splits, [
      { from_member_id: BOB, to_member_id: ALICE, amount: 30, currency: 'EUR' },
    ])
    expect(net(rWrong, 'SGD', ALICE)).toBe(30)  // SGD debt untouched
    expect(net(rWrong, 'SGD', BOB)).toBe(-30)
    expect(net(rWrong, 'EUR', BOB)).toBe(30)    // spurious EUR entry

    // Edit: correct to SGD
    const rFixed = computeNetBalances([ALICE, BOB], splits, [
      { from_member_id: BOB, to_member_id: ALICE, amount: 30, currency: 'SGD' },
    ])
    expect(net(rFixed, 'SGD', ALICE)).toBe(0)
    expect(net(rFixed, 'SGD', BOB)).toBe(0)
    expect(rFixed.has('EUR')).toBe(false)
    expect(simplifyDebts(toNamedBalances(rFixed, 'SGD', NAMES))).toHaveLength(0)
  })

  it('end-to-end: typo in settlement amount corrected → fully settled', () => {
    // Alice paid $90 for 3-way split
    const splits: SplitRow[] = [
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: ALICE, amount: 30 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB,   amount: 30 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: CAROL, amount: 30 },
    ]
    const members = [ALICE, BOB, CAROL]

    // Bob types $20 (typo — should be $30)
    const r1 = computeNetBalances(members, splits, [
      { from_member_id: BOB, to_member_id: ALICE, amount: 20, currency: 'SGD' },
    ])
    const debts1 = simplifyDebts(toNamedBalances(r1, 'SGD', NAMES))
    expect(debts1.find(d => d.from_member_id === BOB)?.amount).toBe(10)
    expect(debts1.find(d => d.from_member_id === CAROL)?.amount).toBe(30)

    // Bob edits to $30 (correct)
    const r2 = computeNetBalances(members, splits, [
      { from_member_id: BOB, to_member_id: ALICE, amount: 30, currency: 'SGD' },
    ])
    const debts2 = simplifyDebts(toNamedBalances(r2, 'SGD', NAMES))
    expect(debts2).toHaveLength(1)
    expect(debts2[0]).toMatchObject({ from_member_id: CAROL, to_member_id: ALICE, amount: 30 })

    // Carol settles too → everyone at zero
    const r3 = computeNetBalances(members, splits, [
      { from_member_id: BOB,   to_member_id: ALICE, amount: 30, currency: 'SGD' },
      { from_member_id: CAROL, to_member_id: ALICE, amount: 30, currency: 'SGD' },
    ])
    members.forEach(m => expect(net(r3, 'SGD', m)).toBe(0))
    expect(simplifyDebts(toNamedBalances(r3, 'SGD', NAMES))).toHaveLength(0)
  })

  it('editing amount on a multi-person debt only affects the corrected settlement', () => {
    // Alice paid $90 (3-way); Bob paid $60 (3-way)
    // Net from splits: Alice +40, Bob +10, Carol -50
    // (Alice: +30 Bob-share +30 Carol-share -20 Alice-owes-Bob = +40)
    // (Bob: -30 owes-Alice +20 Carol-share +20 Carol-share = +10)
    // (Carol: -30 owes-Alice -20 owes-Bob = -50)
    const splits: SplitRow[] = [
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: ALICE, amount: 30 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: BOB,   amount: 30 },
      { paid_by_member_id: ALICE, currency: 'SGD', member_id: CAROL, amount: 30 },
      { paid_by_member_id: BOB,   currency: 'SGD', member_id: ALICE, amount: 20 },
      { paid_by_member_id: BOB,   currency: 'SGD', member_id: BOB,   amount: 20 },
      { paid_by_member_id: BOB,   currency: 'SGD', member_id: CAROL, amount: 20 },
    ]

    // Carol pays Alice $20 (typo — simplifyDebts would say Carol→Alice $40)
    const r1 = computeNetBalances([ALICE, BOB, CAROL], splits, [
      { from_member_id: CAROL, to_member_id: ALICE, amount: 20, currency: 'SGD' },
    ])
    expect(net(r1, 'SGD', ALICE)).toBe(20)  // 40-20
    expect(net(r1, 'SGD', BOB)).toBe(10)    // Bob unaffected
    expect(net(r1, 'SGD', CAROL)).toBe(-30) // -50+20

    // Carol edits to $40 (correct amount owed to Alice per simplifyDebts)
    const r2 = computeNetBalances([ALICE, BOB, CAROL], splits, [
      { from_member_id: CAROL, to_member_id: ALICE, amount: 40, currency: 'SGD' },
    ])
    expect(net(r2, 'SGD', ALICE)).toBe(0)   // Alice fully settled
    expect(net(r2, 'SGD', BOB)).toBe(10)    // Bob still owed by Carol, unaffected
    expect(net(r2, 'SGD', CAROL)).toBe(-10) // Carol still owes Bob $10
  })
})
