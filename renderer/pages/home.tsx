import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowUpRight,
  Plus,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'

import type {
  Setting,
  Transaction,
} from '../../main/db/types'
import type { PortfolioOverview } from '../../main/services/portfolio'
import type { PortfolioSnapshot } from '../../main/services/snapshots'
import type { AnnotatedNewsItem } from '../../main/services/market-api'
import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
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
import { KpiCard } from '@/components/dashboard/KpiCard'
import { PortfolioPerformanceChart } from '@/components/dashboard/PortfolioPerformanceChart'
import { SectorPieChart } from '@/components/dashboard/SectorPieChart'
import { TrendSparkline } from '@/components/dashboard/TrendSparkline'

export default function HomePage() {
  const { t, locale } = useT()
  const displayCurrency = useUi((s) => s.displayCurrency)
  const refreshTick = useUi((s) => s.refreshTick)
  const dataTick = useUi((s) => s.dataTick)
  const initialized = useUi((s) => s.initialized)
  const openQuickTrade = useUi((s) => s.openQuickTrade)

  const [overview, setOverview] = useState<PortfolioOverview | null>(null)
  const [snapshots, setSnapshots] = useState<PortfolioSnapshot[]>([])
  const [recentTx, setRecentTx] = useState<Transaction[]>([])
  const [news, setNews] = useState<AnnotatedNewsItem[]>([])
  const [targets, setTargets] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!initialized) return
    let cancelled = false
    setLoading(true)
    // Promise.allSettled instead of Promise.all so a single failing
    // IPC (e.g. cold portfolio.overview) doesn't blank the whole
    // dashboard. Each source is consumed independently and any
    // rejection surfaces as a single toast at the end rather than
    // a console-only silent break.
    void Promise.allSettled([
      api().portfolio.overview(displayCurrency),
      api().snapshots.list(),
      api().transactions.list(),
      api().market.portfolioNews({ cachedOnly: true }),
      api().settings.list(),
    ])
      .then((results) => {
        if (cancelled) return
        const [ov, snaps, txs, news, settings] = results
        if (ov.status === 'fulfilled') setOverview(ov.value)
        if (snaps.status === 'fulfilled') setSnapshots(snaps.value)
        if (txs.status === 'fulfilled') setRecentTx(txs.value.slice(0, 5))
        if (news.status === 'fulfilled') setNews(news.value.items.slice(0, 5))
        if (settings.status === 'fulfilled') {
          const tgts: Record<string, number> = {}
          for (const s of settings.value as Setting[]) {
            if (s.key.startsWith('targets.')) {
              const v = Number(s.value)
              if (Number.isFinite(v)) tgts[s.key.slice('targets.'.length)] = v
            }
          }
          setTargets(tgts)
        }
        // Aggregate failures into a single toast so we never spam
        // multiple errors at once. The overview is the most critical
        // — if it fails, surface a louder error.
        const failures = results
          .map((r, i) => (r.status === 'rejected' ? i : -1))
          .filter((i) => i >= 0)
        if (failures.length > 0) {
          const firstError = results.find(
            (r) => r.status === 'rejected',
          ) as PromiseRejectedResult | undefined
          if (ov.status === 'rejected') {
            toast.error(
              locale === 'fr'
                ? 'Echec du chargement du tableau de bord.'
                : 'Dashboard load failed.',
              { id: 'dashboard-load' },
            )
          }
          console.warn('dashboard partial load', failures, firstError?.reason)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [displayCurrency, refreshTick, dataTick, initialized, locale])

  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'
  const isEmpty = overview && overview.positions.length === 0
  const noCachedQuotes =
    overview &&
    overview.positions.length > 0 &&
    overview.positions.every((p) => p.currentPrice === null)

  async function openExternal(url: string) {
    try {
      await api().shell.openExternal(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <Head>
        <title>{`${t('nav.dashboard')} · Beta Trading Hub`}</title>
      </Head>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t('nav.dashboard')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {locale === 'fr'
                ? 'Vue agregee : valeur, P&L, allocation, activite recente.'
                : 'Aggregated view: value, P&L, allocation, recent activity.'}
            </p>
          </div>
        </header>

        {loading && !overview && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        )}

        {overview && (
          <>
            {(overview.missingApiKey.finnhub || overview.missingApiKey.twelvedata) && (
              <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 flex items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="size-4 text-amber-500 shrink-0 mt-px" />
                  <div>
                    <p className="text-sm font-medium">
                      {locale === 'fr'
                        ? 'Cles API manquantes'
                        : 'API keys missing'}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {locale === 'fr'
                        ? 'Configure tes cles pour activer les cotations live.'
                        : 'Set your keys to enable live quotes.'}
                    </p>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href="/settings">
                    {locale === 'fr' ? 'Parametres' : 'Settings'}
                  </Link>
                </Button>
              </div>
            )}

            {isEmpty && (
              <Card className="border-dashed">
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Sparkles className="size-4 text-primary" />
                    {locale === 'fr'
                      ? "Commence par une transaction"
                      : 'Start with a transaction'}
                  </CardTitle>
                  <CardDescription>
                    {locale === 'fr'
                      ? 'Le dashboard se rempliera des que tu auras une premiere position.'
                      : 'The dashboard fills up as soon as you have a first position.'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => openQuickTrade()}>
                    <Plus className="size-3.5" />
                    {locale === 'fr' ? 'Ajouter une transaction' : 'Add transaction'}
                  </Button>
                </CardContent>
              </Card>
            )}

            {!isEmpty && (
              <>
                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  <KpiCard
                    title={t('dashboard.totalValue')}
                    value={formatMoney(overview.totalValue, overview.displayCurrency, lc)}
                    delta={{
                      value: `${overview.totalPnl >= 0 ? '+' : ''}${formatMoney(overview.totalPnl, overview.displayCurrency, lc)} · ${formatPercent(overview.totalPnlPct / 100, lc)}`,
                      positive:
                        overview.totalPnl === 0 ? null : overview.totalPnl > 0,
                    }}
                    icon={<Wallet className="size-3.5" />}
                    trail={
                      snapshots.length > 1 ? (
                        <TrendSparkline
                          snapshots={snapshots}
                          displayCurrency={overview.displayCurrency}
                        />
                      ) : null
                    }
                  />
                  <KpiCard
                    title={t('dashboard.dayChange')}
                    value={`${overview.dayChange >= 0 ? '+' : ''}${formatMoney(overview.dayChange, overview.displayCurrency, lc)}`}
                    delta={{
                      value: `${overview.dayChange >= 0 ? '+' : ''}${formatPercent(overview.dayChangePct / 100, lc)}`,
                      positive:
                        overview.dayChange === 0 ? null : overview.dayChange > 0,
                    }}
                    icon={
                      overview.dayChange >= 0 ? (
                        <TrendingUp className="size-3.5 text-positive" />
                      ) : (
                        <TrendingDown className="size-3.5 text-negative" />
                      )
                    }
                  />
                  <KpiCard
                    title={locale === 'fr' ? 'Cout investi' : 'Cost basis'}
                    value={formatMoney(overview.totalCost, overview.displayCurrency, lc)}
                    hint={`${overview.positions.length} ${locale === 'fr' ? 'positions · FX' : 'positions · FX'} ${formatNumber(overview.fxUsdToCad, lc, 4)}`}
                  />
                  <KpiCard
                    title={locale === 'fr' ? 'Secteurs' : 'Sectors'}
                    value={overview.sectors.length}
                    hint={
                      Object.keys(targets).length > 0
                        ? `${Object.keys(targets).length} ${locale === 'fr' ? 'cible(s) definie(s)' : 'target(s) set'}`
                        : locale === 'fr'
                          ? 'Aucune cible definie'
                          : 'No targets set'
                    }
                    icon={<Target className="size-3.5" />}
                  />
                </div>

                {noCachedQuotes && (
                  <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
                    {t('dashboard.noQuotes')}
                  </div>
                )}

                {/* Portfolio performance chart with 1J / 1S / 1M / 1A / Tout tabs */}
                <PortfolioPerformanceChart locale={locale} />

                {/* Allocation + Sector targets */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <Card className="lg:col-span-2">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base">
                        {t('dashboard.allocation')}
                      </CardTitle>
                      <CardDescription className="text-xs">
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

                  <SectorTargetsCompact
                    sectors={overview.sectors}
                    targets={targets}
                    locale={locale}
                  />
                </div>

                {/* Performers + News + Activity */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  <PerformersCard overview={overview} locale={locale} />
                  <NewsWidget
                    news={news}
                    locale={locale}
                    onOpen={openExternal}
                  />
                  <ActivityWidget
                    transactions={recentTx}
                    locale={locale}
                  />
                </div>
              </>
            )}
          </>
        )}
      </div>
    </>
  )
}

interface SectorTargetsCompactProps {
  sectors: PortfolioOverview['sectors']
  targets: Record<string, number>
  locale: 'fr' | 'en'
}

function SectorTargetsCompact({ sectors, targets, locale }: SectorTargetsCompactProps) {
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'
  const tracked = sectors.filter((s) => (targets[s.code] ?? 0) > 0)

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="size-3.5 text-primary" />
            {locale === 'fr' ? 'Cibles' : 'Targets'}
          </CardTitle>
          <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-xs">
            <Link href="/rebalance">
              {locale === 'fr' ? 'Editer' : 'Edit'}
              <ArrowUpRight className="size-3" />
            </Link>
          </Button>
        </div>
        <CardDescription className="text-xs">
          {locale === 'fr' ? 'Actuel vs cible' : 'Current vs target'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tracked.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            {locale === 'fr'
              ? 'Aucune cible definie. Configure-les dans Reequilibrage.'
              : 'No targets set. Configure them in Rebalance.'}
          </p>
        ) : (
          <ul className="space-y-2.5">
            {tracked.map((s) => {
              const target = targets[s.code]
              const delta = s.percent - target
              return (
                <li key={s.code} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="flex items-center gap-1.5 text-foreground">
                      <span
                        className="inline-block size-1.5 rounded-full"
                        style={{ backgroundColor: s.color ?? 'currentColor' }}
                      />
                      {locale === 'fr' ? s.labelFr : s.labelEn}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatNumber(s.percent, lc, 1)}%
                      <span className="opacity-60"> / {formatNumber(target, lc, 1)}%</span>
                    </span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden relative">
                    <div
                      className="h-full"
                      style={{
                        width: `${Math.min(100, s.percent)}%`,
                        backgroundColor: s.color ?? 'var(--primary)',
                      }}
                    />
                    <div
                      className="absolute top-0 bottom-0 w-px bg-foreground/50"
                      style={{ left: `${Math.min(100, target)}%` }}
                    />
                  </div>
                  <div
                    className={cn(
                      'text-[10px] tabular-nums',
                      Math.abs(delta) < 0.5
                        ? 'text-muted-foreground'
                        : delta > 5
                          ? 'text-amber-500'
                          : delta < -5
                            ? 'text-blue-400'
                            : 'text-muted-foreground',
                    )}
                  >
                    {delta >= 0 ? '+' : ''}
                    {formatNumber(delta, lc, 1)} pp
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

type PerfPeriod = 'day' | 'week' | 'month' | 'year' | 'all'

// Pull the right pnlPct field off a position depending on which period
// the user picked. `all` keeps the existing avg-cost behavior; the other
// keys are the period-windowed values computed in portfolio.ts.
function pnlForPeriod(
  p: PortfolioOverview['positions'][number],
  period: PerfPeriod,
): number | null {
  switch (period) {
    case 'day':
      return p.dayPnlPct
    case 'week':
      return p.weekPnlPct
    case 'month':
      return p.monthPnlPct
    case 'year':
      return p.yearPnlPct
    case 'all':
      return p.pnlPct
  }
}

function PerformersCard({
  overview,
  locale,
}: {
  overview: PortfolioOverview
  locale: 'fr' | 'en'
}) {
  const [period, setPeriod] = useState<PerfPeriod>('all')
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'

  // Positions that have a value for the selected period (i.e. history
  // cached AND price could be looked up). Tickers without history show
  // up as null and we exclude them from the top/bottom sort — otherwise
  // they'd cluster at one end with phantom 0% values.
  const eligible = overview.positions.filter(
    (p) => pnlForPeriod(p, period) !== null,
  )
  const sorted = [...eligible].sort(
    (a, b) =>
      (pnlForPeriod(b, period) as number) - (pnlForPeriod(a, period) as number),
  )
  const top = sorted.slice(0, 3)
  const bottom = sorted.slice(-3).reverse()
  const missing = overview.positions.length - eligible.length

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base">
              {locale === 'fr' ? 'Performance' : 'Performance'}
            </CardTitle>
            <CardDescription className="text-xs">
              {locale === 'fr' ? 'Top / Bottom par P&L %' : 'Top / Bottom by P&L %'}
            </CardDescription>
          </div>
          <Tabs
            value={period}
            onValueChange={(v) => setPeriod(v as PerfPeriod)}
          >
            <TabsList className="h-7">
              <TabsTrigger value="day" className="text-xs h-5 px-2">
                1J
              </TabsTrigger>
              <TabsTrigger value="week" className="text-xs h-5 px-2">
                1S
              </TabsTrigger>
              <TabsTrigger value="month" className="text-xs h-5 px-2">
                1M
              </TabsTrigger>
              <TabsTrigger value="year" className="text-xs h-5 px-2">
                1A
              </TabsTrigger>
              <TabsTrigger value="all" className="text-xs h-5 px-2">
                {locale === 'fr' ? 'Tout' : 'All'}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {eligible.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            {locale === 'fr'
              ? "Pas d'historique en cache pour cette periode. Clique sur Actualiser dans le header."
              : 'No history cached for this period. Click Refresh in the header.'}
          </p>
        ) : (
          <>
            <PerformerRow
              title={locale === 'fr' ? 'Top' : 'Top'}
              positions={top}
              period={period}
              locale={lc}
              tone="positive"
            />
            <PerformerRow
              title={locale === 'fr' ? 'Bottom' : 'Bottom'}
              positions={bottom}
              period={period}
              locale={lc}
              tone="negative"
            />
            {missing > 0 && (
              <p className="text-[10px] text-muted-foreground/70 pt-1">
                {locale === 'fr'
                  ? `${missing} ticker(s) sans historique pour cette periode`
                  : `${missing} ticker(s) without history for this period`}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}

interface PerformerRowProps {
  title: string
  positions: PortfolioOverview['positions']
  period: PerfPeriod
  locale: string
  tone: 'positive' | 'negative'
}

function PerformerRow({ title, positions, period, locale, tone }: PerformerRowProps) {
  if (positions.length === 0) return null
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">
        {title}
      </div>
      <ul className="space-y-0.5">
        {positions.map((p) => {
          const pct = pnlForPeriod(p, period) ?? 0
          return (
            <li key={p.ticker}>
              <Link
                href={{ pathname: '/ticker', query: { symbol: p.ticker } }}
                className="flex items-center justify-between gap-2 py-1 rounded hover:bg-muted/50 px-1.5 -mx-1.5 transition-colors"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-medium">{p.ticker}</span>
                  <span className="text-muted-foreground truncate text-xs">
                    {p.name ?? p.sectorLabelFr ?? '—'}
                  </span>
                </div>
                <span
                  className={cn(
                    'tabular-nums font-medium text-xs',
                    tone === 'positive' ? 'text-positive' : 'text-negative',
                  )}
                >
                  {pct >= 0 ? '+' : ''}
                  {formatPercent(pct / 100, locale)}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

interface NewsWidgetProps {
  news: AnnotatedNewsItem[]
  locale: 'fr' | 'en'
  onOpen: (url: string) => void
}

function NewsWidget({ news, locale, onOpen }: NewsWidgetProps) {
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {locale === 'fr' ? 'Actualites' : 'News'}
          </CardTitle>
          <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-xs">
            <Link href="/news">
              {locale === 'fr' ? 'Tout' : 'All'}
              <ArrowUpRight className="size-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {news.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            {locale === 'fr' ? 'Pas de news en cache.' : 'No cached news.'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {news.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onOpen(n.url)}
                  className="w-full text-left group py-1.5 rounded hover:bg-muted/50 px-1.5 -mx-1.5 transition-colors"
                >
                  <div className="text-xs font-medium leading-snug group-hover:text-primary transition-colors line-clamp-2 break-words">
                    {n.headline}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <span className="font-mono">{n.symbol}</span>
                    {n.viaEtf && (
                      <span className="font-mono opacity-70">
                        via {n.viaEtf}
                      </span>
                    )}
                    <span>·</span>
                    <span>{new Date(n.publishedAt).toLocaleDateString(lc)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

interface ActivityWidgetProps {
  transactions: Transaction[]
  locale: 'fr' | 'en'
}

function ActivityWidget({ transactions, locale }: ActivityWidgetProps) {
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {locale === 'fr' ? 'Activite' : 'Activity'}
          </CardTitle>
          <Button asChild variant="ghost" size="sm" className="h-6 px-2 text-xs">
            <Link href="/holdings">
              {locale === 'fr' ? 'Holdings' : 'Holdings'}
              <ArrowUpRight className="size-3" />
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {transactions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">
            {locale === 'fr' ? 'Aucune transaction.' : 'No transactions.'}
          </p>
        ) : (
          <ul className="space-y-0.5">
            {transactions.map((tx) => (
              <li key={tx.id}>
                <Link
                  href={{ pathname: '/ticker', query: { symbol: tx.ticker } }}
                  className="flex items-center justify-between gap-2 py-1.5 rounded hover:bg-muted/50 px-1.5 -mx-1.5 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] h-4 px-1.5 font-normal',
                        tx.kind === 'buy'
                          ? 'border-positive/30 text-positive bg-positive/5'
                          : 'border-negative/30 text-negative bg-negative/5',
                      )}
                    >
                      {tx.kind === 'buy'
                        ? locale === 'fr'
                          ? 'Achat'
                          : 'Buy'
                        : locale === 'fr'
                          ? 'Vente'
                          : 'Sell'}
                    </Badge>
                    <span className="font-mono text-xs font-medium">
                      {tx.ticker}
                    </span>
                  </div>
                  <div className="text-[10px] text-right tabular-nums text-muted-foreground">
                    <div>
                      {formatNumber(tx.quantity, lc, 2)} @{' '}
                      {formatMoney(tx.price, tx.currency, lc)}
                    </div>
                    <div className="opacity-60">{tx.occurredAt}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
