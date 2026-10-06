import { describe, expect, it } from 'vitest'
import { buildPayments, checkAmount, groupDebtsByPerson, type SettleEntry } from '@/lib/settle'
import type { SimplifiedDebt } from '@/types'

const d = (from: number, to: number, amount: number, currency: string): SimplifiedDebt => ({
  from_member_id: from, from_name: `m${from}`, to_member_id: to, to_name: `m${to}`, amount, currency,
})
const ME = 7

describe('groupDebtsByPerson', () => {
  it('collapses several currencies owed to the same person into one group', () => {
    const groups = groupDebtsByPerson([d(ME, 8, 3000, 'JPY'), d(ME, 8, 18.5, 'USD'), d(ME, 9, 12, 'USD')], ME)
    expect(groups.map(g => [g.personId, g.entries.map(e => e.currency)])).toEqual([[8, ['JPY', 'USD']], [9, ['USD']]])
  })

  it('keeps debts that run in opposite directions in one group, paying first', () => {
    const [g] = groupDebtsByPerson([d(8, ME, 10, 'SGD'), d(ME, 8, 3000, 'JPY')], ME)
    expect(g!.entries.map(e => [e.currency, e.direction])).toEqual([['JPY', 'pay'], ['SGD', 'receive']])
    expect(g!.entries[0]).toMatchObject({ from: ME, to: 8, owed: 3000 })
    expect(g!.entries[1]).toMatchObject({ from: 8, to: ME, owed: 10 })
  })

  it('ignores debts between other people and sorts currencies', () => {
    const groups = groupDebtsByPerson([d(8, 9, 50, 'SGD'), d(ME, 8, 1, 'USD'), d(ME, 8, 1, 'JPY')], ME)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.entries.map(e => e.currency)).toEqual(['JPY', 'USD'])
  })

  it('returns nothing when you have no debts', () => {
    expect(groupDebtsByPerson([], ME)).toEqual([])
  })
})

const pay = (owed: number, currency = 'JPY'): SettleEntry => ({ key: `pay-${currency}`, currency, owed, direction: 'pay', from: ME, to: 8 })
const receive = (owed: number, currency = 'SGD'): SettleEntry => ({ key: `receive-${currency}`, currency, owed, direction: 'receive', from: 8, to: ME })

describe('checkAmount', () => {
  it('treats an empty field as skip', () => {
    expect(checkAmount(pay(100), '')).toEqual({ status: 'skip' })
    expect(checkAmount(pay(100), '   ')).toEqual({ status: 'skip' })
  })

  it('accepts the full amount and part-payments, rounding to cents', () => {
    expect(checkAmount(pay(100), '100')).toEqual({ status: 'ok', amount: 100 })
    expect(checkAmount(pay(100), '12.345')).toEqual({ status: 'ok', amount: 12.35 })
  })

  it('tolerates floating point dust above the debt but not a real excess', () => {
    expect(checkAmount(pay(18.5), '18.50').status).toBe('ok')
    expect(checkAmount(pay(18.5), '18.51').status).toBe('error')
  })

  it('words the over-limit error by direction', () => {
    const owe = checkAmount(pay(3000), '3500')
    expect(owe).toMatchObject({ status: 'error' })
    expect((owe as { message: string }).message).toContain('The most you can pay is JPY 3000.00')
    expect((checkAmount(receive(10), '11') as { message: string }).message).toContain("you're owed")
  })

  it('rejects zero, negatives and non-numbers', () => {
    for (const bad of ['0', '-5', 'abc', '1e999', 'Infinity']) {
      expect(checkAmount(pay(100), bad).status).toBe('error')
    }
  })
})

describe('buildPayments', () => {
  const entries = [pay(3000, 'JPY'), pay(18.5, 'USD'), receive(10, 'SGD')]

  it('builds one payment per filled field in the right direction', () => {
    const r = buildPayments(entries, { 'pay-JPY': '1500', 'pay-USD': '', 'receive-SGD': '10' })
    expect(r).toEqual({
      ok: true,
      payments: [
        { from_member_id: ME, to_member_id: 8, amount: 1500, currency: 'JPY' },
        { from_member_id: 8, to_member_id: ME, amount: 10, currency: 'SGD' },
      ],
    })
  })

  it('refuses the whole batch if any field is invalid', () => {
    expect(buildPayments(entries, { 'pay-JPY': '3000', 'pay-USD': '99' }).ok).toBe(false)
  })

  it('refuses when everything is empty', () => {
    const r = buildPayments(entries, {})
    expect(r).toEqual({ ok: false, error: 'Enter an amount for at least one currency.' })
  })
})
