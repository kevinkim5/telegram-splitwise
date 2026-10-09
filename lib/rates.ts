// Exchange rates from Frankfurter (ECB data, no API key). Rates update once per business day.
export type RatesResult =
  | { ok: true; rates: Record<string, number>; date?: string }
  | { ok: false; status: number; error: string }

// Rates for converting each currency in `froms` into `to` (cross-rate via EUR, as Frankfurter is
// EUR-based). A currency the source doesn't know is simply missing from `rates`.
export async function fetchRates(froms: string[], to: string): Promise<RatesResult> {
  const list = [...new Set(froms.map(c => c.trim().toUpperCase()).filter(c => c && c !== to))]
  if (list.length === 0) return { ok: true, rates: {} }

  try {
    const symbols = [...list, to].filter(c => c !== 'EUR').join(',')
    const url = symbols
      ? `https://api.frankfurter.app/latest?symbols=${symbols}`
      : 'https://api.frankfurter.app/latest'

    const res = await fetch(url)
    if (!res.ok) return { ok: false, status: 502, error: 'Failed to fetch rates' }

    const json = await res.json() as { base: string; date?: string; rates: Record<string, number> }
    const eurRates = json.rates // base is EUR; EUR itself is implicitly 1

    // e.g. JPY → SGD = eurRates.SGD / eurRates.JPY
    const toRate = to === 'EUR' ? 1 : eurRates[to]
    if (!toRate) return { ok: false, status: 422, error: `No rate found for ${to}` }

    const rates: Record<string, number> = {}
    for (const from of list) {
      const fromRate = from === 'EUR' ? 1 : eurRates[from]
      if (fromRate) rates[from] = Math.round((toRate / fromRate) * 1e6) / 1e6
    }
    return { ok: true, rates, date: json.date }
  } catch {
    return { ok: false, status: 502, error: 'Failed to fetch rates' }
  }
}
