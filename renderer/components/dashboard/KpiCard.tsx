import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

interface KpiCardProps {
  title: ReactNode
  value: ReactNode
  hint?: ReactNode
  delta?: { value: ReactNode; positive: boolean | null }
  icon?: ReactNode
  trail?: ReactNode
}

export function KpiCard({ title, value, hint, delta, icon, trail }: KpiCardProps) {
  return (
    <div className="relative rounded-lg border border-border bg-card p-4 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        {icon && <span className="text-muted-foreground">{icon}</span>}
      </div>
      <div className="text-[26px] font-semibold tabular-nums tracking-tight mt-1.5 leading-none">
        {value}
      </div>
      {delta && (
        <div
          className={cn(
            'text-xs tabular-nums font-medium mt-1.5',
            delta.positive === null
              ? 'text-muted-foreground'
              : delta.positive
                ? 'text-positive'
                : 'text-negative',
          )}
        >
          {delta.value}
        </div>
      )}
      {hint && (
        <div className="text-[11px] text-muted-foreground mt-1.5">{hint}</div>
      )}
      {trail && (
        <div className="absolute right-0 bottom-0 left-0 h-12 pointer-events-none">
          {trail}
        </div>
      )}
    </div>
  )
}
