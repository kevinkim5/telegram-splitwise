import { NextResponse } from 'next/server'

// Fetches latest rates from Frankfurter (ECB data, no API key required).
// Rates update once per business day at ~16:00 CET.
// Cached at the edge for 1 hour — no point refreshing more often than ECB publishes.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fromParam = searchParams.get('from') // comma-separated: "JPY,USD"
  const to = searchParams.get('to')          // target currency: "SGD"

  if (!fromParam || !to) {
    return NextResponse.json({ error: 'Missing from or to param' }, { status: 400 })
  }

  const froms = [...new Set(
    fromParam.split(',').map(c => c.trim().toUpperCase()).filter(c => c && c !== to)
  )]

  if (froms.length === 0) {
    return NextResponse.json({ rates: {}, to })
  }

  try {
    // Frankfurter returns EUR-based rates; request only the currencies we need
    const symbols = [...froms, to].filter(c => c !== 'EUR').join(',')
    const url = symbols
      ? `https://api.frankfurter.app/latest?symbols=${symbols}`
      : 'https://api.frankfurter.app/latest'

    const res = await fetch(url)
    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch rates' }, { status: 502 })
    }

    const json = await res.json() as { base: string; rates: Record<string, number> }
    const eurRates = json.rates // base is EUR; EUR itself is implicitly 1

    // Cross-rate: from → to via EUR
    // e.g. JPY → SGD = eurRates.SGD / eurRates.JPY
    const toRate = to === 'EUR' ? 1 : eurRates[to]
    if (!toRate) {
      return NextResponse.json({ error: `No rate found for ${to}` }, { status: 422 })
    }

    const rates: Record<string, number> = {}
    for (const from of froms) {
      const fromRate = from === 'EUR' ? 1 : eurRates[from]
      if (fromRate) rates[from] = Math.round((toRate / fromRate) * 1e6) / 1e6
    }

    return NextResponse.json(
      { rates, to },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' } }
    )
  } catch {
    return NextResponse.json({ error: 'Failed to fetch rates' }, { status: 502 })
  }
}
