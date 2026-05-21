import Head from 'next/head'
import { useEffect, useState } from 'react'
import {
  AlertTriangle,
  Coins,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { SectorPieChart } from '@/components/dashboard/SectorPieChart'
import type { PortfolioOverview } from '../../main/services/portfolio'

export default function HomePage() {
  const { t, locale } = useT()
  const displayCurrency = useUi((s) => s.displayCurrency)
  const refreshTick = useUi((s) => s.refreshTick)
  const initialized = useUi((s) => s.initialized)

  const [overview, setOverview] = useState<PortfolioOverview | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!initialized) return
    let cancelled = false
    setLoading(true)
    api()
      .portfolio.overview(displayCurrency)
      .then((data) => {
        if (!cancelled) setOverview(data)
      })
      .catch((err: Error) => {
        if (!cancelled) console.error('overview failed', err)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [displayCurrency, refreshTick, initialized])

  const isEmpty = overview && overview.positions.length === 0
  const noCachedQuotes =
    overview && overview.positions.length > 0 && overview.positions.every((p) => p.currentPrice === null)

  return (
    <>
      <Head>
        <title>{`${t('nav.dashboard')} · Portfolio Tracker`}</title>
      </Head>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('nav.dashboard')}
          </h1>
        </header>

        {loading && !overview && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        )}

        {overview && (
          <>
            {(overview.missingApiKey.finnhub || overview.missingApiKey.twelvedata) && (
              <Card className="border-amber-500/40 bg-amber-500/5">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <AlertTriangle className="size-4 text-amber-500" />
                    {locale === 'fr' ? 'Cles API manquantes' : 'API keys missing'}
                  </CardTitle>
                  <CardDescription>
                    {locale === 'fr'
                      ? 'Configure tes cles dans Parametres pour activer les cotations en temps reel.'
                      : 'Set your keys in Settings to enable live quotes.'}
                  </CardDescription>
                </CardHeader>
              </Card>
            )}

            {isEmpty && (
              <Card>
                <CardHeader>
                  <CardTitle>{t('dashboard.empty')}</CardTitle>
                </CardHeader>
              </Card>
            )}

            {!isEmpty && (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <KpiCard
                    title={t('dashboard.totalValue')}
                    value={formatMoney(
                      overview.totalValue,
                      overview.displayCurrency,
                      locale === 'fr' ? 'fr-CA' : 'en-CA',
                    )}
                    delta={{
                      value: `${overview.totalPnl >= 0 ? '+' : ''}${formatMoney(
                        overview.totalPnl,
                        overview.displayCurrency,
                        locale === 'fr' ? 'fr-CA' : 'en-CA',
                      )} (${formatPercent(overview.totalPnlPct / 100, locale === 'fr' ? 'fr-CA' : 'en-CA')})`,
                      positive: overview.totalPnl === 0 ? null : overview.totalPnl > 0,
                    }}
                    icon={<Wallet className="size-4" />}
                  />
                  <KpiCard
                    title={t('dashboard.dayChange')}
                    value={`${overview.dayChange >= 0 ? '+' : ''}${formatMoney(
                      overview.dayChange,
                      overview.displayCurrency,
                      locale === 'fr' ? 'fr-CA' : 'en-CA',
                    )}`}
                    delta={{
                      value: formatPercent(
                        overview.dayChangePct / 100,
                        locale === 'fr' ? 'fr-CA' : 'en-CA',
                      ),
                      positive:
                        overview.dayChange === 0 ? null : overview.dayChange > 0,
                    }}
                    icon={
                      overview.dayChange >= 0 ? (
                        <TrendingUp className="size-4 text-emerald-500" />
                      ) : (
                        <TrendingDown className="size-4 text-red-500" />
                      )
                    }
                  />
                  <KpiCard
                    title={
                      locale === 'fr' ? 'Cout total investi' : 'Total cost basis'
                    }
                    value={formatMoney(
                      overview.totalCost,
                      overview.displayCurrency,
                      locale === 'fr' ? 'fr-CA' : 'en-CA',
                    )}
                    hint={
                      locale === 'fr'
                        ? `${overview.positions.length} positions · FX USD→CAD ${formatNumber(overview.fxUsdToCad, 'fr-CA', 4)}`
                        : `${overview.positions.length} positions · FX USD→CAD ${formatNumber(overview.fxUsdToCad, 'en-CA', 4)}`
                    }
                    icon={<Coins className="size-4" />}
                  />
                </div>

                {noCachedQuotes && (
                  <Card className="border-blue-500/40 bg-blue-500/5">
                    <CardHeader>
                      <CardTitle className="text-base">
                        {t('dashboard.noQuotes')}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card className="lg:col-span-2">
                    <CardHeader>
                      <CardTitle>{t('dashboard.allocation')}</CardTitle>
                      <CardDescription>
                        {locale === 'fr'
                          ? 'Repartition de la valeur de marche par secteur.'
                          : 'Market value breakdown by sector.'}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <SectorPieChart
                        sectors={overview.sectors}
                        locale={locale}
                      />
                    </CardContent>
                  </Card>

                  <PerformersCard overview={overview} locale={locale} />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

function PerformersCard({
  overview,
  locale,
}: {
  overview: PortfolioOverview
  locale: 'fr' | 'en'
}) {
  const sortedByPnl = [...overview.positions].sort((a, b) => b.pnlPct - a.pnlPct)
  const top = sortedByPnl.slice(0, 3)
  const bottom = sortedByPnl.slice(-3).reverse()
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {locale === 'fr' ? 'Top / Bottom' : 'Top / Bottom'}
        </CardTitle>
        <CardDescription>
          {locale === 'fr'
            ? 'Meilleures et pires positions par P&L %.'
            : 'Best and worst positions by P&L %.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <PerformerRow
          title={locale === 'fr' ? 'Top' : 'Top'}
          positions={top}
          locale={lc}
          accent="emerald"
        />
        <PerformerRow
          title={locale === 'fr' ? 'Bottom' : 'Bottom'}
          positions={bottom}
          locale={lc}
          accent="red"
        />
      </CardContent>
    </Card>
  )
}

interface PerformerRowProps {
  title: string
  positions: PortfolioOverview['positions']
  locale: string
  accent: 'emerald' | 'red'
}

function PerformerRow({ title, positions, locale, accent }: PerformerRowProps) {
  if (positions.length === 0) return null
  return (
    <div className="space-y-1">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-1">
        {positions.map((p) => (
          <li
            key={p.ticker}
            className="flex items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Badge variant="secondary" className="font-mono">
                {p.ticker}
              </Badge>
              <span className="text-muted-foreground truncate">
                {p.name ?? p.sectorLabelFr ?? '—'}
              </span>
            </div>
            <span
              className={`tabular-nums font-medium ${
                accent === 'emerald'
                  ? 'text-emerald-500'
                  : 'text-red-500'
              }`}
            >
              {p.pnlPct >= 0 ? '+' : ''}
              {formatPercent(p.pnlPct / 100, locale)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
