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
  // tooltip = the raw stringified value when it's a primitive, so a
  // truncated long money string is recoverable on hover. Skip for
  // complex ReactNode values where stringification is meaningless.
  const valueTitle =
    typeof value === 'string' || typeof value === 'number'
      ? String(value)
      : undefined
  return (
    <div className="relative rounded-lg border border-border bg-card p-4 overflow-hidden">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">
          {title}
        </span>
        {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
      </div>
      {/* text-2xl (24px) on a Tailwind scale instead of arbitrary 26px;
          truncate prevents long money strings from blowing the card
          width on narrow 4-col grids. */}
      <div
        className="text-2xl font-semibold tabular-nums tracking-tight mt-1.5 leading-none truncate"
        title={valueTitle}
      >
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
