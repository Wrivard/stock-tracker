import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface KpiCardProps {
  title: ReactNode
  value: ReactNode
  hint?: ReactNode
  delta?: { value: ReactNode; positive: boolean | null }
  icon?: ReactNode
}

export function KpiCard({ title, value, hint, delta, icon }: KpiCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between gap-2 text-sm font-medium text-muted-foreground">
          {title}
          {icon}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-3xl font-semibold tabular-nums tracking-tight">
          {value}
        </div>
        {delta && (
          <div
            className={cn(
              'text-sm tabular-nums font-medium',
              delta.positive === null
                ? 'text-muted-foreground'
                : delta.positive
                  ? 'text-emerald-500'
                  : 'text-red-500',
            )}
          >
            {delta.value}
          </div>
        )}
        {hint && <CardDescription>{hint}</CardDescription>}
      </CardContent>
    </Card>
  )
}
