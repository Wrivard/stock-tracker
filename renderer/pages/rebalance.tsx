import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowDownToLine, ArrowUpFromLine, Check } from 'lucide-react'

import type { Sector } from '../../main/db/types'
import type { PortfolioOverview } from '../../main/services/portfolio'
import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { formatMoney, formatNumber } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const REBALANCE_TOLERANCE = 5


interface RebalanceRow {
  code: string
  labelFr: string
  labelEn: string
  color: string | null
  currentValue: number
  currentPct: number
  targetPct: number
  deltaPct: number
  deltaValue: number
}

export default function RebalancePage() {
  const { t, locale } = useT()
  const displayCurrency = useUi((s) => s.displayCurrency)
  const refreshTick = useUi((s) => s.refreshTick)
  const initialized = useUi((s) => s.initialized)

  const [overview, setOverview] = useState<PortfolioOverview | null>(null)
  const [sectors, setSectors] = useState<Sector[]>([])
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [savingFor, setSavingFor] = useState<string | null>(null)
  const dataTick = useUi((s) => s.dataTick)

  const reload = async () => {
    setLoading(true)
    try {
      const [ov, sec, settings] = await Promise.all([
        api().portfolio.overview(displayCurrency),
        api().sectors.list(),
        api().settings.list(),
      ])
      setOverview(ov)
      setSectors(sec)
      const t: Record<string, number> = {}
      for (const s of settings) {
        if (s.key.startsWith('targets.')) {
          const code = s.key.slice('targets.'.length)
          const v = Number(s.value)
          if (Number.isFinite(v)) t[code] = v
        }
      }
      setTargets(t)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!initialized) return
    void reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayCurrency, refreshTick, dataTick, initialized])

  const totalTarget = useMemo(
    () => Object.values(targets).reduce((a, b) => a + b, 0),
    [targets],
  )

  const rows: RebalanceRow[] = useMemo(() => {
    if (!overview) return []
    const totalValue = overview.totalValue
    const sectorMap = new Map(overview.sectors.map((s) => [s.code, s]))
    return sectors.map((sec) => {
      const current = sectorMap.get(sec.code)
      const currentValue = current?.value ?? 0
      const currentPct = current?.percent ?? 0
      const targetPct = targets[sec.code] ?? 0
      const deltaPct = currentPct - targetPct
      const deltaValue = totalValue * (deltaPct / 100)
      return {
        code: sec.code,
        labelFr: sec.labelFr,
        labelEn: sec.labelEn,
        color: sec.color,
        currentValue,
        currentPct,
        targetPct,
        deltaPct,
        deltaValue,
      }
    })
  }, [overview, sectors, targets])

  async function saveTarget(code: string, value: number) {
    if (!Number.isFinite(value) || value < 0 || value > 100) return
    setSavingFor(code)
    try {
      await api().settings.set(`targets.${code}`, String(value))
      setTargets((prev) => ({ ...prev, [code]: value }))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSavingFor(null)
    }
  }

  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'
  const totalsOk = Math.abs(totalTarget - 100) < 0.01

  return (
    <>
      <Head>
        <title>{`${t('rebalance.title')} · Portfolio Tracker`}</title>
      </Head>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {t('rebalance.title')}
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            {t('rebalance.targetsHelp')}
          </p>
        </header>

        {loading && !overview && (
          <Skeleton className="h-[400px] w-full rounded-xl" />
        )}

        {overview && (
          <>
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <CardTitle className="text-base">
                      {locale === 'fr' ? 'Cibles vs courant' : 'Targets vs current'}
                    </CardTitle>
                    <CardDescription>
                      {locale === 'fr'
                        ? `Valeur totale : ${formatMoney(overview.totalValue, overview.displayCurrency, lc)}. Tolerance ±${REBALANCE_TOLERANCE} %.`
                        : `Total value: ${formatMoney(overview.totalValue, overview.displayCurrency, lc)}. Tolerance ±${REBALANCE_TOLERANCE}%.`}
                    </CardDescription>
                  </div>
                  <Badge
                    variant={totalsOk ? 'default' : 'destructive'}
                    className="tabular-nums"
                  >
                    {totalsOk ? (
                      <>
                        <Check className="size-3" /> 100%
                      </>
                    ) : (
                      t('rebalance.totalsMustSum', {
                        total: formatNumber(totalTarget, lc, 2),
                      })
                    )}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          {locale === 'fr' ? 'Secteur' : 'Sector'}
                        </TableHead>
                        <TableHead className="text-right">
                          {locale === 'fr' ? 'Valeur' : 'Value'}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('rebalance.currentPct')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('rebalance.targetPct')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('rebalance.deltaPct')}
                        </TableHead>
                        <TableHead className="text-right">
                          {t('rebalance.deltaValue')}
                        </TableHead>
                        <TableHead>{t('rebalance.action')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => {
                        const off = Math.abs(r.deltaPct) > REBALANCE_TOLERANCE && r.targetPct > 0
                        const needBuy = r.deltaPct < -REBALANCE_TOLERANCE
                        const needSell = r.deltaPct > REBALANCE_TOLERANCE
                        return (
                          <TableRow key={r.code}>
                            <TableCell>
                              <span
                                className="inline-block size-2 rounded-full mr-2 align-middle"
                                style={{
                                  backgroundColor: r.color ?? 'var(--chart-1)',
                                }}
                              />
                              {locale === 'fr' ? r.labelFr : r.labelEn}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-muted-foreground">
                              {formatMoney(
                                r.currentValue,
                                overview.displayCurrency,
                                lc,
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatNumber(r.currentPct, lc, 1)}%
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  max="100"
                                  className="h-8 w-20 text-right tabular-nums"
                                  value={r.targetPct === 0 ? '' : r.targetPct}
                                  onChange={(e) => {
                                    const v = e.target.value === '' ? 0 : Number(e.target.value)
                                    setTargets((prev) => ({ ...prev, [r.code]: v }))
                                  }}
                                  onBlur={(e) => {
                                    const v = e.target.value === '' ? 0 : Number(e.target.value)
                                    if (Number.isFinite(v)) {
                                      void saveTarget(r.code, v)
                                    }
                                  }}
                                />
                                <span className="text-xs text-muted-foreground">
                                  %
                                </span>
                                {savingFor === r.code && (
                                  <span className="text-xs text-muted-foreground">
                                    …
                                  </span>
                                )}
                              </div>
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right tabular-nums',
                                off && needSell && 'text-amber-500',
                                off && needBuy && 'text-blue-400',
                              )}
                            >
                              {r.targetPct > 0 ? (
                                <>
                                  {r.deltaPct > 0 ? '+' : ''}
                                  {formatNumber(r.deltaPct, lc, 1)} pp
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell
                              className={cn(
                                'text-right tabular-nums',
                                off && needSell && 'text-amber-500',
                                off && needBuy && 'text-blue-400',
                              )}
                            >
                              {r.targetPct > 0 ? (
                                <>
                                  {r.deltaValue >= 0 ? '+' : ''}
                                  {formatMoney(
                                    r.deltaValue,
                                    overview.displayCurrency,
                                    lc,
                                  )}
                                </>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {off && needBuy && (
                                <Badge
                                  variant="outline"
                                  className="text-blue-400 border-blue-400/40 bg-blue-400/5"
                                >
                                  <ArrowDownToLine className="size-3" />
                                  {locale === 'fr' ? 'Acheter' : 'Buy'}{' '}
                                  {formatMoney(
                                    Math.abs(r.deltaValue),
                                    overview.displayCurrency,
                                    lc,
                                  )}
                                </Badge>
                              )}
                              {off && needSell && (
                                <Badge
                                  variant="outline"
                                  className="text-amber-500 border-amber-500/40 bg-amber-500/5"
                                >
                                  <ArrowUpFromLine className="size-3" />
                                  {locale === 'fr' ? 'Vendre' : 'Sell'}{' '}
                                  {formatMoney(
                                    Math.abs(r.deltaValue),
                                    overview.displayCurrency,
                                    lc,
                                  )}
                                </Badge>
                              )}
                              {!off && r.targetPct > 0 && (
                                <Badge
                                  variant="outline"
                                  className="border-positive/30 text-positive bg-positive/5"
                                >
                                  <Check className="size-3" />
                                  OK
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </>
  )
}
