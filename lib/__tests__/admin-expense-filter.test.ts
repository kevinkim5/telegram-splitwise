import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => { ;(globalThis as any).React = require('react') })

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { expensesHref, isFiltered, parseAdminFilter, todaySg } from '../admin-expense-filter'
import { ExpenseFilterBar } from '../../app/admin/[groupId]/ExpenseFilterBar'

describe('parseAdminFilter', () => {
  it('reads q, from and to; trims q; swaps a reversed range', () => {
    expect(parseAdminFilter({ q: '  taxi ', from: '2026-10-06', to: '2026-10-01' })).toEqual({ q: 'taxi', from: '2026-10-01', to: '2026-10-06', error: null })
  })
  it('nothing set is not filtered', () => {
    const f = parseAdminFilter({})
    expect(f).toEqual({ q: '', from: null, to: null, error: null })
    expect(isFiltered(f)).toBe(false)
  })
  it('a malformed date drops all filters and says why', () => {
    const f = parseAdminFilter({ q: 'x', from: '10/06/2026' })
    expect(f.error).toMatch(/Invalid date/)
    expect(isFiltered(f)).toBe(false)
  })
  it('open-ended ranges are filters', () => {
    expect(isFiltered(parseAdminFilter({ from: '2026-10-01' }))).toBe(true)
    expect(isFiltered(parseAdminFilter({ to: '2026-10-01' }))).toBe(true)
  })
})

describe('expensesHref', () => {
  it('keeps the filter and the deleted toggle; page only past 1', () => {
    expect(expensesHref(5, { q: '', from: null, to: null })).toBe('/admin/5?tab=expenses')
    expect(expensesHref(5, { q: 'a&b', from: '2026-10-01', to: null }, { deleted: true, page: 2 })).toBe('/admin/5?tab=expenses&q=a%26b&from=2026-10-01&deleted=1&page=2')
    expect(expensesHref(5, { q: '', from: null, to: null }, { page: 1 })).toBe('/admin/5?tab=expenses')
  })
})

describe('todaySg', () => {
  it('is the Singapore calendar day (UTC+8)', () => {
    const d = todaySg(new Date('2026-10-09T17:30:00Z')) // 01:30 on the 10th in Singapore
    expect([d.getFullYear(), d.getMonth() + 1, d.getDate()]).toEqual([2026, 10, 10])
  })
})

describe('ExpenseFilterBar', () => {
  const none = { q: '', from: null, to: null, error: null }
  it('is a GET form to the Expenses tab with search and date fields', () => {
    const html = renderToStaticMarkup(createElement(ExpenseFilterBar, { groupId: 5, filter: none, showDeleted: false, summary: null }))
    expect(html).toMatch(/<form method="get" action="\/admin\/5"/)
    expect(html).toContain('name="tab" value="expenses"')
    expect(html).toContain('name="q"')
    expect(html).toContain('name="from"')
    expect(html).toContain('name="to"')
    expect(html).not.toContain('Clear')
    expect(html).not.toContain('name="deleted"')
  })
  it('shows current values, Clear, summary, and carries the deleted toggle', () => {
    const html = renderToStaticMarkup(createElement(ExpenseFilterBar, {
      groupId: 5, filter: { q: 'taxi', from: '2026-10-01', to: '2026-10-06', error: null }, showDeleted: true, summary: '2 of 9 expenses match · SGD 34.00',
    }))
    expect(html).toContain('value="taxi"')
    expect(html).toContain('value="2026-10-01"')
    expect(html).toContain('name="deleted" value="1"')
    expect(html).toContain('Clear')
    expect(html).toContain('2 of 9 expenses match')
  })
  it('inputs are 16px so iOS does not zoom', () => {
    const html = renderToStaticMarkup(createElement(ExpenseFilterBar, { groupId: 5, filter: none, showDeleted: false, summary: null }))
    expect(html).toMatch(/\.adm-filter input \{ font-size: 16px/)
  })
  it('an invalid date is explained', () => {
    const html = renderToStaticMarkup(createElement(ExpenseFilterBar, { groupId: 5, filter: { ...none, error: 'Invalid date (use YYYY-MM-DD)' }, showDeleted: false, summary: null }))
    expect(html).toContain('Invalid date')
  })
})
