import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Camera } from 'lucide-react'

import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { formatMoney, formatPercent } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PortfolioValueChart } from '@/components/history/PortfolioValueChart'
import type { PortfolioSnapshot } from '../../main/services/snapshots'

type Period = '1W' | '1M' | '3M' | '1Y' | 'ALL'

function cutoffMs(period: Period): number {
  const day = 86_400_000
  switch (period) {
    case '1W': return Date.now() - 7 * day
    case '1M': return Date.now() - 30 * day
    case '3M': return Date.now() - 90 * day
    case '1Y': return Date.now() - 365 * day
    case 'ALL': return 0
  }
}

export default function HistoryPage() {
  const { t, locale } = useT()
  const displayCurrency = useUi((s) => s.displayCurrency)
  const refreshTick = useUi((s) => s.refreshTick)
  const initialized = useUi((s) => s.initialized)

  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState<Period>('1M')
  const [capturing, setCapturing] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      const data = await api().snapshots.list()
      setSnapshots(data)
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
  }, [initialized, refreshTick])

  const filtered = useMemo(() => {
    const c = cutoffMs(period)
    return snapshots.filter((s) => new Date(s.date).getTime() >= c)
  }, [snapshots, period])

  const first = filtered[0]
  const last = filtered[filtered.length - 1]
  const startVal = first
    ? displayCurrency === 'CAD'
      ? first.totalValueCad
      : first.totalValueUsd ?? first.totalValueCad
    : 0
  const endVal = last
    ? displayCurrency === 'CAD'
      ? last.totalValueCad
      : last.totalValueUsd ?? last.totalValueCad
    : 0
  const periodChange = endVal - startVal
  const periodPct = startVal > 0 ? (periodChange / startVal) * 100 : 0
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'

  async function handleCapture() {
    setCapturing(true)
    try {
      const snap = await api().snapshots.capture()
      if (snap) {
        toast.success(
          locale === 'fr'
            ? `Snapshot enregistre pour ${snap.date}`
            : `Snapshot saved for ${snap.date}`,
        )
        await reload()
      } else {
        toast.info(
          locale === 'fr'
            ? 'Aucune position — rien a capturer.'
            : 'No positions — nothing to snapshot.',
        )
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setCapturing(false)
    }
  }

  return (
    <>
      <Head>
        <title>{t('history.title')} · Portfolio Tracker</title>
      </Head>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('history.title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {locale === 'fr'
                ? 'Evolution de la valeur du portefeuille a partir des snapshots quotidiens.'
                : 'Portfolio value evolution from daily snapshots.'}
            </p>
          </div>
          <Button
            variant="outline"
            onClick={handleCapture}
            disabled={capturing}
          >
            <Camera />
            {capturing
              ? t('common.refreshing')
              : locale === 'fr'
                ? 'Capturer maintenant'
                : 'Snapshot now'}
          </Button>
        </header>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <CardTitle className="text-base">
                  {locale === 'fr' ? 'Evolution' : 'Evolution'}
                </CardTitle>
                <CardDescription>
                  {filtered.length > 0
                    ? `${filtered.length} ${locale === 'fr' ? 'snapshots' : 'snapshots'} · ${first?.date} → ${last?.date}`
                    : t('history.empty')}
                </CardDescription>
              </div>
              <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
                <TabsList>
                  <TabsTrigger value="1W">1S</TabsTrigger>
                  <TabsTrigger value="1M">1M</TabsTrigger>
                  <TabsTrigger value="3M">3M</TabsTrigger>
                  <TabsTrigger value="1Y">1A</TabsTrigger>
                  <TabsTrigger value="ALL">{locale === 'fr' ? 'Tout' : 'All'}</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-[320px] w-full" />
            ) : filtered.length === 0 ? (
              <div className="h-[320px] flex items-center justify-center text-sm text-muted-foreground">
                {t('history.empty')}
              </div>
            ) : (
              <PortfolioValueChart
                snapshots={filtered}
                displayCurrency={displayCurrency}
                locale={locale}
              />
            )}
          </CardContent>
        </Card>

        {filtered.length > 1 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardDescription>
                  {locale === 'fr' ? 'Valeur de fin' : 'End value'}
                </CardDescription>
                <CardTitle className="tabular-nums">
                  {formatMoney(endVal, displayCurrency, lc)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>
                  {locale === 'fr' ? 'Variation sur la periode' : 'Period change'}
                </CardDescription>
                <CardTitle
                  className={`tabular-nums ${
                    periodChange > 0
                      ? 'text-emerald-500'
                      : periodChange < 0
                        ? 'text-red-500'
                        : ''
                  }`}
                >
                  {periodChange >= 0 ? '+' : ''}
                  {formatMoney(periodChange, displayCurrency, lc)}
                  <Badge
                    variant="secondary"
                    className="ml-2 tabular-nums"
                  >
                    {periodPct >= 0 ? '+' : ''}
                    {formatPercent(periodPct / 100, lc)}
                  </Badge>
                </CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader>
                <CardDescription>
                  {locale === 'fr' ? 'Snapshots' : 'Snapshots'}
                </CardDescription>
                <CardTitle className="tabular-nums">
                  {snapshots.length}
                </CardTitle>
              </CardHeader>
            </Card>
          </div>
        )}
      </div>
    </>
  )
}
