import type { Currency } from '../../main/db/types'

const FORMATTERS = new Map<string, Intl.NumberFormat>()

function fmt(locale: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}|${JSON.stringify(options)}`
  let f = FORMATTERS.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, options)
    FORMATTERS.set(key, f)
  }
  return f
}

export function formatMoney(
  value: number,
  currency: Currency = 'CAD',
  locale = 'fr-CA',
): string {
  return fmt(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function formatNumber(
  value: number,
  locale = 'fr-CA',
  fractionDigits = 2,
): string {
  return fmt(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value)
}

export function formatPercent(value: number, locale = 'fr-CA'): string {
  return fmt(locale, {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export function todayIsoDate(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
