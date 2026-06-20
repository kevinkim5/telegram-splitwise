import { describe, it, expect } from 'vitest'
import { simplifyDebts, type NamedBalance } from '../balances'

function bal(member_id: number, name: string, net_amount: number, currency = 'SGD'): NamedBalance {
  return { member_id, member_name: name, net_amount, currency }
}

describe('simplifyDebts', () => {
  it('returns empty for empty input', () => {
    expect(simplifyDebts([])).toEqual([])
  })

  it('returns empty when all balances are zero', () => {
    expect(simplifyDebts([bal(1, 'Alice', 0), bal(2, 'Bob', 0)])).toEqual([])
  })

  it('filters out amounts below 0.005 threshold', () => {
    expect(simplifyDebts([bal(1, 'Alice', 0.004), bal(2, 'Bob', -0.004)])).toEqual([])
  })

  it('simple 2-person debt: B owes A', () => {
    const result = simplifyDebts([bal(1, 'Alice', 30), bal(2, 'Bob', -30)])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({
      from_member_id: 2,
      from_name: 'Bob',
      to_member_id: 1,
      to_name: 'Alice',
      amount: 30,
      currency: 'SGD',
    })
  })

  it('one creditor, two debtors', () => {
    const result = simplifyDebts([
      bal(1, 'Alice', 100),
      bal(2, 'Bob', -60),
      bal(3, 'Carol', -40),
    ])
    expect(result).toHaveLength(2)
    // Both payments go to Alice
    result.forEach(d => expect(d.to_member_id).toBe(1))
    // Bob and Carol are the payers
    expect(result.map(d => d.from_member_id).sort()).toEqual([2, 3])
    // Total paid equals Alice's credit
    expect(result.reduce((s, d) => s + d.amount, 0)).toBeCloseTo(100)
  })

  it('two creditors, one debtor', () => {
    const result = simplifyDebts([
      bal(1, 'Alice', 70),
      bal(2, 'Bob', -100),
      bal(3, 'Carol', 30),
    ])
    expect(result).toHaveLength(2)
    // All payments come from Bob
    result.forEach(d => expect(d.from_member_id).toBe(2))
    // Receivers are Alice and Carol
    expect(result.map(d => d.to_member_id).sort()).toEqual([1, 3])
    expect(result.reduce((s, d) => s + d.amount, 0)).toBeCloseTo(100)
  })

  it('chain simplification: A owes B, B owes C → A pays C directly', () => {
    // Net balances: Alice +10, Bob 0, Carol -10
    const result = simplifyDebts([
      bal(1, 'Alice', 10),
      bal(2, 'Bob', 0),
      bal(3, 'Carol', -10),
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ from_member_id: 3, to_member_id: 1, amount: 10 })
  })

  it('complex 4-person case: total paid equals total owed', () => {
    // Alice: +12, Bob: +3, Carol: -8, Dave: -7
    const result = simplifyDebts([
      bal(1, 'Alice', 12),
      bal(2, 'Bob', 3),
      bal(3, 'Carol', -8),
      bal(4, 'Dave', -7),
    ])
    const totalPaid = result.reduce((s, d) => s + d.amount, 0)
    expect(totalPaid).toBeCloseTo(15)
    // All payers are Carol or Dave
    result.forEach(d => expect([3, 4]).toContain(d.from_member_id))
    // All recipients are Alice or Bob
    result.forEach(d => expect([1, 2]).toContain(d.to_member_id))
  })

  it('all-settled group produces no debts', () => {
    // Everyone paid equally and owes equally → net 0
    const result = simplifyDebts([
      bal(1, 'Alice', 0),
      bal(2, 'Bob', 0),
      bal(3, 'Carol', 0),
    ])
    expect(result).toEqual([])
  })

  it('amounts are rounded to 2 decimal places', () => {
    const result = simplifyDebts([
      bal(1, 'Alice', 3.335),
      bal(2, 'Bob', -3.335),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].amount).toBe(3.34)
  })

  it('currency is taken from creditor and preserved in output', () => {
    const result = simplifyDebts([
      { member_id: 1, member_name: 'Alice', net_amount: 50, currency: 'EUR' },
      { member_id: 2, member_name: 'Bob', net_amount: -50, currency: 'EUR' },
    ])
    expect(result[0].currency).toBe('EUR')
  })

  it('uneven 3-person split produces correct individual amounts', () => {
    // A: +10, B: -6, C: -4
    const result = simplifyDebts([
      bal(1, 'Alice', 10),
      bal(2, 'Bob', -6),
      bal(3, 'Carol', -4),
    ])
    const bobDebt = result.find(d => d.from_member_id === 2)
    const carolDebt = result.find(d => d.from_member_id === 3)
    expect(bobDebt?.amount).toBeCloseTo(6)
    expect(carolDebt?.amount).toBeCloseTo(4)
  })
})
