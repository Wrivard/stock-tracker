import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatMoney } from '@/lib/format'
import type { HistoricalCandle } from '../../../main/services/types'
import type { Currency } from '../../../main/db/types'

interface PriceChartProps {
  candles: HistoricalCandle[]
  currency: Currency
  locale: 'fr' | 'en'
  height?: number
}

export function PriceChart({
  candles,
  currency,
  locale,
  height = 280,
}: PriceChartProps) {
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'
  const data = useMemo(
    () => candles.map((c) => ({ date: c.date, price: c.close })),
    [candles],
  )
  const first = data[0]?.price ?? 0
  const last = data[data.length - 1]?.price ?? 0
  const trendUp = last >= first

  const config: ChartConfig = {
    price: {
      label: locale === 'fr' ? 'Cours' : 'Price',
      color: trendUp ? 'var(--positive)' : 'var(--negative)',
    },
  }

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-muted-foreground"
        style={{ height }}
      >
        {locale === 'fr'
          ? 'Pas de donnees historiques en cache. Verifie ta cle Twelve Data dans Parametres.'
          : 'No historical data cached. Check your Twelve Data key in Settings.'}
      </div>
    )
  }

  return (
    <ChartContainer config={config} style={{ height }} className="w-full">
      <AreaChart data={data} margin={{ left: 12, right: 12, top: 8 }}>
        <defs>
          <linearGradient id="fillPrice" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-price)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--color-price)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.4} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={36}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={68}
          domain={['auto', 'auto']}
          tick={{ fontSize: 11 }}
          tickFormatter={(v: number) =>
            new Intl.NumberFormat(lc, {
              notation: 'compact',
              maximumFractionDigits: 1,
            }).format(v)
          }
        />
        <ChartTooltip
          cursor={{ stroke: 'var(--border)', strokeDasharray: '3 3' }}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(label) => label}
              formatter={(value) => formatMoney(Number(value), currency, lc)}
            />
          }
        />
        <Area
          dataKey="price"
          type="monotone"
          stroke="var(--color-price)"
          fill="url(#fillPrice)"
          strokeWidth={1.5}
          dot={false}
          activeDot={{ r: 3, strokeWidth: 0 }}
        />
      </AreaChart>
    </ChartContainer>
  )
}
