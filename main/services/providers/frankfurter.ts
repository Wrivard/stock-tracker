import { frankfurterBucket } from '../throttle'
import type { Currency } from '../../db/types'
import type { FxRate, ProviderError } from '../types'

const BASE = 'https://api.frankfurter.dev/v1'

function fail(
  code: ProviderError['code'],
  message: string,
  status?: number,
): ProviderError {
  const err = new Error(message) as ProviderError
  err.code = code
  err.provider = 'frankfurter'
  if (status !== undefined) err.status = status
  return err
}

interface FrankfurterResponse {
  amount: number
  base: string
  date: string
  rates: Record<string, number>
}

export async function fetchFxRate(from: Currency, to: Currency): Promise<FxRate> {
  if (from === to) {
    return {
      from,
      to,
      rate: 1,
      date: new Date().toISOString().slice(0, 10),
      fetchedAt: Date.now(),
    }
  }
  await frankfurterBucket.take(1)
  const url = `${BASE}/latest?base=${from}&symbols=${to}`
  const res = await fetch(url)
  if (res.status === 429)
    throw fail('rate_limit', 'Frankfurter rate limit hit', 429)
  if (!res.ok) throw fail('unknown', `Frankfurter HTTP ${res.status}`, res.status)
  const json = (await res.json()) as FrankfurterResponse
  const rate = json.rates?.[to]
  if (typeof rate !== 'number')
    throw fail('not_found', `No rate ${from}->${to} in response`, 404)
  return { from, to, rate, date: json.date, fetchedAt: Date.now() }
}
