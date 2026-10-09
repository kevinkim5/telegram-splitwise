import { NextResponse } from 'next/server'
import { fetchRates } from '@/lib/rates'

// Cached at the edge for 1 hour — ECB publishes once per business day (~16:00 CET), so there is
// no point refreshing more often.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const fromParam = searchParams.get('from') // comma-separated: "JPY,USD"
  const to = searchParams.get('to')          // target currency: "SGD"

  if (!fromParam || !to) {
    return NextResponse.json({ error: 'Missing from or to param' }, { status: 400 })
  }

  const result = await fetchRates(fromParam.split(','), to)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status })

  return NextResponse.json(
    { rates: result.rates, to, ...(result.date ? { date: result.date } : {}) },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=300' } },
  )
}
