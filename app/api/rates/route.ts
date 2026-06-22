import { NextResponse } from 'next/server'

// Proxies Yahoo Finance currency pairs (e.g. JPYSGD=X) to avoid CORS issues.
// Cached at the edge for 5 minutes to reduce upstream hits.
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
    const results = await Promise.all(
      froms.map(async (from) => {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${from}${to}=X`,
          { headers: { 'User-Agent': 'Mozilla/5.0 (compatible)' } }
        )
        if (!res.ok) return { from, rate: null }
        const json = await res.json() as {
          chart?: { result?: [{ meta?: { regularMarketPrice?: number } }] }
        }
        const rate = json.chart?.result?.[0]?.meta?.regularMarketPrice ?? null
        return { from, rate }
      })
    )

    const rates: Record<string, number> = {}
    for (const { from, rate } of results) {
      if (rate !== null) rates[from] = rate
    }

    return NextResponse.json(
      { rates, to },
      { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } }
    )
  } catch {
    return NextResponse.json({ error: 'Failed to fetch rates' }, { status: 502 })
  }
}
