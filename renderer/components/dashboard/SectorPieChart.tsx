import { useMemo } from 'react'
import { Cell, Pie, PieChart } from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import type { PortfolioSectorAllocation } from '../../../main/services/portfolio'

interface SectorPieChartProps {
  sectors: PortfolioSectorAllocation[]
  locale: 'fr' | 'en'
}

export function SectorPieChart({ sectors, locale }: SectorPieChartProps) {
  const config = useMemo<ChartConfig>(() => {
    const c: ChartConfig = { value: { label: locale === 'fr' ? 'Valeur' : 'Value' } }
    for (const s of sectors) {
      c[s.code] = {
        label: locale === 'fr' ? s.labelFr : s.labelEn,
        color: s.color ?? 'var(--chart-1)',
      }
    }
    return c
  }, [sectors, locale])

  const data = sectors.map((s) => ({
    code: s.code,
    label: locale === 'fr' ? s.labelFr : s.labelEn,
    value: s.value,
    fill: s.color ?? 'var(--chart-1)',
  }))

  if (sectors.length === 0) {
    return (
      <div className="text-sm text-muted-foreground text-center py-12">
        {locale === 'fr' ? 'Aucune donnee a afficher.' : 'No data to display.'}
      </div>
    )
  }

  return (
    <ChartContainer config={config} className="aspect-[4/3] max-h-[260px] mx-auto">
      <PieChart>
        <ChartTooltip
          cursor={false}
          content={<ChartTooltipContent nameKey="label" hideLabel />}
        />
        <Pie
          data={data}
          dataKey="value"
          nameKey="code"
          innerRadius={58}
          outerRadius={92}
          paddingAngle={2}
          strokeWidth={1.5}
          stroke="var(--background)"
        >
          {data.map((d) => (
            <Cell key={d.code} fill={d.fill} />
          ))}
        </Pie>
        <ChartLegend
          content={<ChartLegendContent nameKey="code" className="text-[11px]" />}
          verticalAlign="bottom"
        />
      </PieChart>
    </ChartContainer>
  )
}
