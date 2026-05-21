import { useMemo } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatMoney } from '@/lib/format'
import type { PortfolioSnapshot } from '../../../main/services/snapshots'
import type { Currency } from '../../../main/db/types'

interface PortfolioValueChartProps {
  snapshots: PortfolioSnapshot[]
  displayCurrency: Currency
  locale: 'fr' | 'en'
}

export function PortfolioValueChart({
  snapshots,
  displayCurrency,
  locale,
}: PortfolioValueChartProps) {
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'

  const data = useMemo(
    () =>
      snapshots.map((s) => ({
        date: s.date,
        value:
          displayCurrency === 'CAD'
            ? s.totalValueCad
            : (s.totalValueUsd ?? s.totalValueCad),
      })),
    [snapshots, displayCurrency],
  )

  const config: ChartConfig = {
    value: {
      label: locale === 'fr' ? 'Valeur' : 'Value',
      color: 'var(--chart-2)',
    },
  }

  if (data.length === 0) return null

  return (
    <ChartContainer config={config} className="h-[320px] w-full">
      <AreaChart data={data} margin={{ left: 12, right: 12, top: 8 }}>
        <defs>
          <linearGradient id="fillValue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-value)" stopOpacity={0.5} />
            <stop offset="95%" stopColor="var(--color-value)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={32}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          width={70}
          tickFormatter={(v: number) =>
            new Intl.NumberFormat(lc, {
              notation: 'compact',
              maximumFractionDigits: 1,
            }).format(v)
          }
        />
        <ChartTooltip
          cursor={true}
          content={
            <ChartTooltipContent
              indicator="line"
              labelFormatter={(label) => label}
              formatter={(value) =>
                formatMoney(Number(value), displayCurrency, lc)
              }
            />
          }
        />
        <Area
          dataKey="value"
          type="monotone"
          stroke="var(--color-value)"
          fill="url(#fillValue)"
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
