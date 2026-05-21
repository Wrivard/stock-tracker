import { Area, AreaChart, ResponsiveContainer } from 'recharts'

// Generic-but-believable curve shape. Slight upward drift with two
// dips so the placeholder still reads as "stock-like" instead of a
// pure sine wave. Values are arbitrary — we only render it for
// aesthetics, never label the axes.
const GHOST_POINTS = [
  { x: 0, y: 100 },
  { x: 1, y: 104 },
  { x: 2, y: 102 },
  { x: 3, y: 108 },
  { x: 4, y: 105 },
  { x: 5, y: 112 },
  { x: 6, y: 118 },
  { x: 7, y: 115 },
  { x: 8, y: 122 },
  { x: 9, y: 119 },
  { x: 10, y: 126 },
  { x: 11, y: 130 },
]

// Loading state for chart cards. Renders a real AreaChart with a muted
// gradient + pulse animation, so the placeholder visually anticipates
// the layout that's about to land. Plain skeleton rectangles felt jarring
// here because the real chart has axes + gradient — the eye expects a
// chart-shaped silhouette while the data fetches.
export function ChartSkeleton({ height = 260 }: { height?: number }) {
  return (
    <div
      className="w-full animate-pulse"
      style={{ height }}
      aria-hidden="true"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={GHOST_POINTS}
          margin={{ left: 12, right: 12, top: 4, bottom: 0 }}
        >
          <defs>
            <linearGradient id="ghostFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--muted-foreground)" stopOpacity={0.25} />
              <stop offset="95%" stopColor="var(--muted-foreground)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            dataKey="y"
            type="monotone"
            stroke="var(--muted-foreground)"
            strokeOpacity={0.35}
            fill="url(#ghostFill)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
