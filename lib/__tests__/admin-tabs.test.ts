import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => { ;(globalThis as any).React = require('react') }) // the component uses JSX (classic runtime here)

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { AdminTabs, GROUP_TABS, parseTab, tabHref } from '../../app/admin/[groupId]/AdminTabs'

describe('parseTab', () => {
  it('accepts the four tabs and falls back to overview for anything else', () => {
    for (const t of GROUP_TABS) expect(parseTab(t.key)).toBe(t.key)
    for (const bad of [undefined, '', 'nonsense', 'EXPENSES', 'expenses ', '../x']) expect(parseTab(bad)).toBe('overview')
  })
})

describe('tabHref', () => {
  it('overview has no query; others use ?tab=', () => {
    expect(tabHref(12, 'overview')).toBe('/admin/12')
    expect(tabHref(12, 'expenses')).toBe('/admin/12?tab=expenses')
  })
})

describe('AdminTabs', () => {
  const html = renderToStaticMarkup(createElement(AdminTabs, { groupId: 12, active: 'settlements' }))

  it('renders one link per tab and marks only the active one', () => {
    expect(html.match(/<a /g)).toHaveLength(4)
    expect(html.match(/<a aria-current="page"/g)).toHaveLength(1) // on links only, not the CSS text
    expect(html).toMatch(/<a aria-current="page" href="\/admin\/12\?tab=settlements">Settlements<\/a>/)
  })

  it('keeps the CSS raw: React escapes quotes in a <style> text child, which would break the active-tab selector', () => {
    expect(html).toContain('a[aria-current="page"]')
    expect(html).not.toContain('&quot;')
  })

  it('is pinned (sticky) and scrolls sideways rather than wrapping on very narrow screens', () => {
    expect(html).toContain('position: sticky')
    expect(html).toContain('overflow-x: auto')
    expect(html).toContain('white-space: nowrap')
  })
})
