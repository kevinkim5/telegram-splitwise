import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.hoisted(() => { ;(globalThis as any).React = require('react') })

const calls: { text: string; values: unknown[] }[] = []
vi.mock('@/lib/sql', () => {
  const sql: any = (strings: TemplateStringsArray, ...values: unknown[]) => {
    const text = strings.join('?')
    calls.push({ text, values })
    const rows = (() => {
      if (/COUNT\(\*\) FILTER \(WHERE deleted_at IS NULL\)[\s\S]*FROM expenses/.test(text)) return [{ active: 9, deleted: 1 }]
      if (/FROM settlements WHERE/.test(text) && /COUNT/.test(text)) return [{ active: 2, deleted: 0 }]
      if (/FILTER \(WHERE e\.deleted_at IS NULL\)/.test(text)) return [{ active: 2, deleted: 0 }]
      if (/SUM\(e\.total_amount\)::float/.test(text)) return [{ currency: 'SGD', total: 34 }]
      if (/SELECT currency, SUM\(total_amount\)/.test(text)) return [{ currency: 'SGD', total: 300 }]
      if (/COUNT\(\*\)::int AS n FROM members/.test(text)) return [{ n: 3 }]
      if (/FROM groups WHERE id/.test(text)) return [{ id: 5, title: 'Tokyo Trip' }]
      return []
    })()
    return Promise.resolve(rows)
  }
  sql.transaction = vi.fn()
  return { sql }
})
vi.mock('@/auth', () => ({ auth: vi.fn(), signOut: vi.fn() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/db', () => ({ ensureSchema: vi.fn() }))

import { renderToStaticMarkup } from 'react-dom/server'
import AdminGroupPage from '../../app/admin/[groupId]/page'

const render = async (sp: Record<string, string>) => {
  calls.length = 0
  const el = await AdminGroupPage({ params: Promise.resolve({ groupId: '5' }), searchParams: Promise.resolve(sp) })
  return renderToStaticMarkup(el)
}

describe('admin group page', () => {
  beforeEach(() => { calls.length = 0 })

  it('Expenses, Settlements and Members tabs have no heading above the list', async () => {
    for (const tab of ['expenses', 'settlements', 'members']) {
      const html = await render({ tab })
      expect(html, tab).not.toMatch(/<h2/)
    }
    expect(await render({})).toMatch(/<h2[^>]*>Outstanding Balances/) // overview keeps its title
  })

  it('Expenses tab shows the filter bar; others do not', async () => {
    expect(await render({ tab: 'expenses' })).toContain('name="q"')
    expect(await render({ tab: 'settlements' })).not.toContain('name="q"')
  })

  it('a filter is passed to the list query as bound params (never inlined) and summarised', async () => {
    const html = await render({ tab: 'expenses', q: "50%' OR 1=1 --", from: '2026-10-01', to: '2026-10-06' })
    const list = calls.find(c => /json_agg/.test(c.text))!
    expect(list.values).toContain('%50\\%\' OR 1=1 --%')
    expect(list.values).toContain('2026-10-01')
    expect(list.values).toContain('2026-10-06')
    expect(list.text).not.toMatch(/1=1/)
    expect(list.text).toMatch(/ILIKE \? ESCAPE '\\'/)
    expect(html).toContain('2 of 9 expenses match')
    expect(html).toContain('SGD 34.00')
  })

  it('unfiltered list passes null filters and no summary line', async () => {
    const html = await render({ tab: 'expenses' })
    const list = calls.find(c => /json_agg/.test(c.text))!
    expect(list.values.filter(v => v === null)).toHaveLength(8) // from x2, to x2, pattern x4
    expect(html).not.toContain('expenses match')
  })

  it('an invalid date shows the message and does not filter', async () => {
    const html = await render({ tab: 'expenses', from: 'garbage', q: 'x' })
    expect(html).toContain('Invalid date')
    expect(calls.some(c => /SUM\(e\.total_amount\)::float/.test(c.text))).toBe(false)
  })

  it('"Show deleted" and pager links keep the filter', async () => {
    const html = await render({ tab: 'expenses', q: 'taxi' })
    expect(html).toMatch(/href="\/admin\/5\?tab=expenses&amp;q=taxi&amp;deleted=1"/)
  })
})
