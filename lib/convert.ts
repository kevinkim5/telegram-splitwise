// The currency everything is summed and shown in when converting
export const CONVERT_TO = 'SGD'

export interface CurrencyLine {
  currency: string
  net: number // positive = gets back, negative = owes
}

export interface ConvertedSum {
  total: number            // signed, rounded once at the end, in the target currency
  missing: string[]        // currencies we had no rate for (left out of the total)
  usedAny: boolean         // false if nothing could be converted
}

// Sums signed per-currency balances into one amount in `target`. Unrounded until the end, so
// rounding error doesn't accumulate across currencies. A currency with no rate is reported in
// `missing` rather than silently counted as zero.
export function sumConverted(
  lines: CurrencyLine[],
  rates: Record<string, number> | null | undefined,
  target: string,
): ConvertedSum {
  let total = 0
  let usedAny = false
  const missing: string[] = []
  for (const { currency, net } of lines) {
    if (currency === target) {
      total += net
      usedAny = true
      continue
    }
    const rate = rates?.[currency]
    if (rate) {
      total += net * rate
      usedAny = true
    } else {
      missing.push(currency)
    }
  }
  return { total: Math.round(total * 100) / 100, missing, usedAny }
}

// "−JPY 3000.00 · −USD 18.50 · +SGD 10.00": the original amounts a converted total is made of.
export function breakdown(lines: CurrencyLine[]): string {
  return lines
    .map(({ currency, net }) => `${net < 0 ? '−' : '+'}${currency} ${Math.abs(net).toFixed(2)}`)
    .join(' · ')
}
