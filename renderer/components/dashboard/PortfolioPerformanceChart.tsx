import { useEffect, useState } from 'react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { toast } from 'sonner'

import type {
  PortfolioTimeSeriesResult,
  TimeSeriesPeriod,
} from '../../../main/services/timeseries'
import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { formatMoney, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ChartSkeleton } from '@/components/dashboard/ChartSkeleton'

const PERIODS: Array<{ key: TimeSeriesPeriod; labelFr: string; labelEn: string }> = [
  { key: 'day', labelFr: '1J', labelEn: '1D' },
  { key: 'week', labelFr: '1S', labelEn: '1W' },
  { key: 'month', labelFr: '1M', labelEn: '1M' },
  { key: 'year', labelFr: '1A', labelEn: '1Y' },
  { key: 'all', labelFr: 'Tout', labelEn: 'All' },
]

interface PortfolioPerformanceChartProps {
  locale: 'fr' | 'en'
}

export function PortfolioPerformanceChart({
  locale,
}: PortfolioPerformanceChartProps) {
  const displayCurrency = useUi((s) => s.displayCurrency)
  const refreshTick = useUi((s) => s.refreshTick)
  const dataTick = useUi((s) => s.dataTick)
  const initialized = useUi((s) => s.initialized)

  const [period, setPeriod] = useState<TimeSeriesPeriod>('month')
  const [data, setData] = useState<PortfolioTimeSeriesResult | null>(null)
  const [loading, setLoading] = useState(true)
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'

  useEffect(() => {
    if (!initialized) return
    let cancelled = false
    setLoading(true)
    api()
      .portfolio.timeSeries(period, displayCurrency)
      .then((r) => {
        if (cancelled) return
        setData(r)
      })
      .catch((err: Error) => {
        if (cancelled) return
        toast.error(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // Re-fetch when the user picks a different period, when quotes/data
    // change (refresh button + tx CRUD), or when the display currency
    // toggles. dataTick handles the case where the user adds/removes
    // transactions which changes the position history retroactively.
  }, [initialized, period, refreshTick, dataTick, displayCurrency])

  const tone =
    data && data.pnlPct >= 0 ? 'text-positive' : 'text-negative'

  const config: ChartConfig = {
    value: {
      label: locale === 'fr' ? 'Valeur' : 'Value',
      // Green/red gradient based on direction. The CSS var is read by
      // shadcn's chart wrapper for the gradient fill below.
      color:
        data && data.pnlPct >= 0
          ? 'var(--positive)'
          : 'var(--negative)',
    },
  }

  const noPositions = !loading && data && data.points.every((p) => p.value === 0)
  const showSkeleton = loading && !data

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">
              {locale === 'fr'
                ? 'Performance du portefeuille'
                : 'Portfolio performance'}
            </CardTitle>
            {data && data.points.length > 0 && (
              <div className="flex items-baseline gap-3 mt-1">
                <span className="text-2xl font-semibold tabular-nums">
                  {formatMoney(data.endValue, data.displayCurrency, lc)}
                </span>
                <span
                  className={cn('text-xs font-medium tabular-nums', tone)}
                >
                  {data.pnlPct >= 0 ? '+' : ''}
                  {formatPercent(data.pnlPct / 100, lc)}
                </span>
              </div>
            )}
          </div>
          <Tabs
            value={period}
            onValueChange={(v) => setPeriod(v as TimeSeriesPeriod)}
          >
            <TabsList className="h-7">
              {PERIODS.map((p) => (
                <TabsTrigger
                  key={p.key}
                  value={p.key}
                  className="text-xs h-5 px-2"
                >
                  {locale === 'fr' ? p.labelFr : p.labelEn}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent>
        {showSkeleton ? (
          <ChartSkeleton height={260} />
        ) : noPositions ? (
          <p className="text-xs text-muted-foreground py-12 text-center">
            {locale === 'fr'
              ? "Pas d'historique en cache pour cette periode. Clique sur Actualiser dans le header."
              : 'No history cached for this period. Click Refresh in the header.'}
          </p>
        ) : data && data.points.length > 0 ? (
          // Tailwind v4 arbitrary variant: target only the stroke path
          // that Recharts renders for the area's curve (NOT the filled
          // area path, which would create a halo around the whole
          // shape including the bottom edge at the X axis). The glow
          // tints with the same CSS var as the line color, so the
          // green/red switch via `config.value.color` propagates here
          // automatically.
          <ChartContainer
            config={config}
            className="h-[260px] w-full [&_.recharts-area-curve]:[filter:drop-shadow(0_0_5px_var(--color-value))]"
          >
            <AreaChart
              data={data.points}
              margin={{ left: 12, right: 12, top: 4, bottom: 0 }}
            >
              <defs>
                <linearGradient
                  id="portfolioPerfFill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="var(--color-value)"
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-value)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(v: string) =>
                  // For 1J / 1S show MM-DD; for longer windows the
                  // month-only label keeps the axis readable.
                  period === 'year' || period === 'all'
                    ? v.slice(0, 7)
                    : v.slice(5)
                }
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={70}
                domain={['auto', 'auto']}
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
                      formatMoney(Number(value), data.displayCurrency, lc)
                    }
                  />
                }
              />
              <Area
                dataKey="value"
                type="monotone"
                stroke="var(--color-value)"
                fill="url(#portfolioPerfFill)"
                strokeWidth={2}
                dot={false}
                // Smooth left-to-right draw-in. Short duration so
                // changing periods feels snappy rather than fancy.
                isAnimationActive
                animationDuration={500}
                animationEasing="ease-out"
              />
            </AreaChart>
          </ChartContainer>
        ) : null}
        {data && data.missingTickers.length > 0 && (
          <p className="text-[10px] text-muted-foreground/70 mt-2">
            {locale === 'fr'
              ? `${data.missingTickers.length} ticker(s) sans historique : ${data.missingTickers.slice(0, 5).join(', ')}${data.missingTickers.length > 5 ? '…' : ''}`
              : `${data.missingTickers.length} ticker(s) without history: ${data.missingTickers.slice(0, 5).join(', ')}${data.missingTickers.length > 5 ? '…' : ''}`}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
