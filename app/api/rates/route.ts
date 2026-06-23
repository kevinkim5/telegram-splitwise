import { NextResponse } from 'next/server'

const APP_ID = process.env.OPEN_EXCHANGE_RATES_APP_ID

// Fetches latest rates from Open Exchange Rates (USD base, free tier).
// Cross-rates to the target currency are computed server-side.
// Cached at the edge for 30 minutes — OXR free tier updates hourly.
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

  if (!APP_ID) {
    return NextResponse.json({ error: 'Exchange rate service not configured' }, { status: 503 })
  }

  try {
    const res = await fetch(
      `https://openexchangerates.org/api/latest.json?app_id=${APP_ID}&symbols=${[...froms, to].join(',')}`,
      { next: { revalidate: 1800 } } // Next.js fetch cache: 30 min
    )

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as { description?: string }
      return NextResponse.json(
        { error: err.description ?? 'Failed to fetch rates' },
        { status: res.status }
      )
    }

    const json = await res.json() as { base: string; rates: Record<string, number> }
    const usdRates = json.rates // base is USD

    // Convert each source currency to target via USD cross-rate
    // e.g. JPY → SGD = (1 / usdRates.JPY) * usdRates.SGD
    const toRate = to === 'USD' ? 1 : usdRates[to]
    if (!toRate) {
      return NextResponse.json({ error: `No rate found for ${to}` }, { status: 422 })
    }

    const rates: Record<string, number> = {}
    for (const from of froms) {
      const fromRate = from === 'USD' ? 1 : usdRates[from]
      if (fromRate) rates[from] = toRate / fromRate
    }

    return NextResponse.json(
      { rates, to },
      { headers: { 'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=300' } }
    )
  } catch {
    return NextResponse.json({ error: 'Failed to fetch rates' }, { status: 502 })
  }
}
