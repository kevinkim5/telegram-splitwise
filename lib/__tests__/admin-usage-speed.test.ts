import { describe, expect, it, vi } from 'vitest'

vi.hoisted(() => { ;(globalThis as any).React = require('react') })

let timingsEmpty = false
vi.mock('@/lib/sql', () => {
  const sql: any = (strings: TemplateStringsArray) => {
    const t = strings.join('?')
    if (/percentile_cont/.test(t)) {
      return Promise.resolve(timingsEmpty ? [] : [
        { model: 'gemini-flash-latest', answered: 4, failed: 1, p50: 4500, p95: 8400, avg_ms: '5250.00', avg_thought: '612.5', avg_prompt: '1100', avg_bytes: '310000' },
      ])
    }
    if (/FROM receipt_scan_timings/.test(t)) {
      return Promise.resolve(timingsEmpty ? [] : [
        { created_at: '2026-10-11T03:00:00Z', model: 'gemini-flash-latest', outcome: 'ok', total_ms: 3200, gemini_ms: 3100, attempts: 1, prompt_tokens: 1100, thought_tokens: 640, output_tokens: 55, image_bytes: 300000 },
        { created_at: '2026-10-11T02:00:00Z', model: 'gemini-flash-latest', outcome: 'overloaded', total_ms: 9100, gemini_ms: 800, attempts: 2, prompt_tokens: null, thought_tokens: null, output_tokens: null, image_bytes: 300000 },
      ])
    }
    if (/COUNT\(\*\) FILTER \(WHERE created_at > NOW\(\) - INTERVAL '1 hour'\)/.test(t) && /FROM receipt_scans/.test(t) && !/GROUP BY/.test(t)) return Promise.resolve([{ last_hour: 0, today: 1, d7: 2, d30: 3, total: 3, users30: 1, since: '2026-10-01T00:00:00Z' }])
    return Promise.resolve([])
  }
  return { sql }
})
vi.mock('@/auth', () => ({ signOut: vi.fn() }))
vi.mock('@/lib/db', () => ({ ensureSchema: vi.fn() }))
vi.mock('next/link', () => ({ default: (p: any) => require('react').createElement('a', { href: p.href }, p.children) }))

import { renderToStaticMarkup } from 'react-dom/server'
import AdminUsagePage from '../../app/admin/usage/page'

describe('admin Usage: Speed section', () => {
  it('shows median, slowest 1 in 20, average, failures and token averages per model', async () => {
    timingsEmpty = false
    const html = renderToStaticMarkup(await AdminUsagePage())
    expect(html).toContain('Speed (last 30 days)')
    expect(html).toContain('gemini-flash-latest')
    expect(html).toContain('4.5 s')   // median
    expect(html).toContain('8.4 s')   // p95
    expect(html).toContain('5.3 s')   // string average from the database is formatted
    expect(html).toContain('1 failed')
    expect(html).toContain('avg thinking tokens 613')
    expect(html).toContain('avg image 303 KB')
  })

  it('lists the latest scans with outcome, tries and tokens, failures flagged', async () => {
    const html = renderToStaticMarkup(await AdminUsagePage())
    expect(html).toContain('Latest 2 scans')
    expect(html).toContain('3.2 s · ok')
    expect(html).toContain('9.1 s · overloaded')
    expect(html).toContain('(2 tries)')
    expect(html).toContain('thinking 640')
  })

  it('says timings start with the next scan when there are none', async () => {
    timingsEmpty = true
    const html = renderToStaticMarkup(await AdminUsagePage())
    expect(html).toContain('No timings yet')
    expect(html).not.toContain('Latest ')
  })
})
