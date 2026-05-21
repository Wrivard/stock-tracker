import { useMemo } from 'react'
import { Area, AreaChart } from 'recharts'

import {
  ChartContainer,
  type ChartConfig,
} from '@/components/ui/chart'
import type { PortfolioSnapshot } from '../../../main/services/snapshots'
import type { Currency } from '../../../main/db/types'

interface TrendSparklineProps {
  snapshots: PortfolioSnapshot[]
  displayCurrency: Currency
}

const config: ChartConfig = {
  value: { label: 'Value', color: 'var(--primary)' },
}

export function TrendSparkline({ snapshots, displayCurrency }: TrendSparklineProps) {
  const data = useMemo(
    () =>
      snapshots.slice(-30).map((s) => ({
        date: s.date,
        value:
          displayCurrency === 'CAD'
            ? s.totalValueCad
            : (s.totalValueUsd ?? s.totalValueCad),
      })),
    [snapshots, displayCurrency],
  )
  if (data.length < 2) return null
  const positive = data[data.length - 1].value >= data[0].value
  return (
    <ChartContainer config={config} className="h-12 w-full">
      <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop
              offset="5%"
              stopColor={positive ? 'var(--positive)' : 'var(--negative)'}
              stopOpacity={0.3}
            />
            <stop
              offset="95%"
              stopColor={positive ? 'var(--positive)' : 'var(--negative)'}
              stopOpacity={0}
            />
          </linearGradient>
        </defs>
        <Area
          dataKey="value"
          type="monotone"
          stroke={positive ? 'var(--positive)' : 'var(--negative)'}
          strokeWidth={1.25}
          fill="url(#trendFill)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  )
}
