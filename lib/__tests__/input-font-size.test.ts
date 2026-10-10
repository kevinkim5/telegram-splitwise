import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'fs'
import { join } from 'path'

// iOS Safari zooms the whole page into any text field whose font size is below 16px, and the Mini App
// is mostly used on iPhones. Inputs get their size from the `.tg-input` class (16px); this catches an
// inline font size smaller than that being put on an input, select or textarea.
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) return name === 'admin' || name === '__tests__' || name === 'node_modules' ? [] : sourceFiles(p)
    return /\.tsx$/.test(name) ? [p] : []
  })
}

describe('form controls do not trigger the iOS focus zoom', () => {
  const files = [...sourceFiles('components'), ...sourceFiles('app')]

  it('scans the screens that have inputs', () => {
    expect(files.some(f => f.endsWith('ExpenseFilters.tsx'))).toBe(true)
    expect(files.some(f => f.endsWith('ExpenseFormPage.tsx'))).toBe(true)
  })

  it('no <input>, <select> or <textarea> sets an inline fontSize below 16', () => {
    const offenders: string[] = []
    for (const file of files) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/<(input|select|textarea)\b/g)) {
        const rest = src.slice(m.index!)
        const tag = rest.slice(0, (rest.indexOf('/>') === -1 ? rest.indexOf('</') : rest.indexOf('/>')) + 2)
        for (const f of tag.matchAll(/fontSize:\s*(\d+(?:\.\d+)?)(?!\s*\+)/g)) {
          if (Number(f[1]) < 16) offenders.push(`${file}: <${m[1]}> fontSize ${f[1]}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })
})
