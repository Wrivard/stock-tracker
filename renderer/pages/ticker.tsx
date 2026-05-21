import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowUpRight,
  ExternalLink,
  Pencil,
  Plus,
  Target,
  Trash2,
} from 'lucide-react'

import type {
  Sector,
  Transaction,
  TransactionInput,
} from '../../main/db/types'
import type {
  EtfDetails,
  HistoricalCandle,
  HistoryPeriod,
  NewsItem,
  Profile,
} from '../../main/services/types'
import type { CachedEntry } from '../../main/services/cache'
import type { PortfolioOverview } from '../../main/services/portfolio'
import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT, formatRelativeTime } from '@/lib/i18n'
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PriceChart } from '@/components/ticker/PriceChart'
import { EtfDetailsCard } from '@/components/ticker/EtfDetailsCard'
import { TransactionForm } from '@/components/holdings/TransactionForm'

export default function TickerPage() {
  const router = useRouter()
  const symbolRaw = router.query.symbol
  const symbol =
    typeof symbolRaw === 'string' ? symbolRaw.toUpperCase() : null

  const { t, locale } = useT()
  const displayCurrency = useUi((s) => s.displayCurrency)
  const refreshTick = useUi((s) => s.refreshTick)
  const dataTick = useUi((s) => s.dataTick)
  const initialized = useUi((s) => s.initialized)
  const openQuickTrade = useUi((s) => s.openQuickTrade)
  const bumpData = useUi((s) => s.bumpData)

  const [overview, setOverview] = useState<PortfolioOverview | null>(null)
  const [profile, setProfile] = useState<CachedEntry<Profile> | null>(null)
  const [history, setHistory] = useState<CachedEntry<HistoricalCandle[]> | null>(null)
  const [news, setNews] = useState<CachedEntry<NewsItem[]> | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [sectors, setSectors] = useState<Sector[]>([])
  const [targetPct, setTargetPct] = useState<number | null>(null)
  const [period, setPeriod] = useState<HistoryPeriod>('1Y')
  const [loading, setLoading] = useState(true)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [etfDetails, setEtfDetails] = useState<CachedEntry<EtfDetails | null> | null>(null)

  const position = useMemo(
    () => overview?.positions.find((p) => p.ticker === symbol) ?? null,
    [overview, symbol],
  )
  const sectorAlloc = useMemo(
    () =>
      position?.sectorCode && overview
        ? overview.sectors.find((s) => s.code === position.sectorCode) ?? null
        : null,
    [position, overview],
  )

  useEffect(() => {
    if (!initialized || !symbol) return
    let cancelled = false
    setLoading(true)
    Promise.all([
      api().portfolio.overview(displayCurrency),
      api().market.profile(symbol).catch(() => null),
      api().market.history(symbol, period).catch(() => null),
      api().market.news(symbol).catch(() => null),
      api().transactions.list({ ticker: symbol }),
      api().sectors.list(),
      api().market.etfDetails(symbol).catch(() => null),
    ])
      .then(([ov, prof, hist, n, txs, secs, etf]) => {
        if (cancelled) return
        setOverview(ov)
        setProfile(prof)
        setHistory(hist)
        setNews(n)
        setTransactions(txs)
        setSectors(secs)
        setEtfDetails(etf)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [symbol, period, displayCurrency, refreshTick, dataTick, initialized])

  // Sector target lookup runs separately because it depends on the position
  // sector code resolved from the overview.
  useEffect(() => {
    if (!position?.sectorCode) {
      setTargetPct(null)
      return
    }
    api()
      .settings.get(`targets.${position.sectorCode}`)
      .then((raw) => {
        if (raw === null) return setTargetPct(null)
        const v = Number(raw)
        setTargetPct(Number.isFinite(v) ? v : null)
      })
      .catch(() => setTargetPct(null))
  }, [position?.sectorCode])

  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'

  async function handleUpdateTx(input: TransactionInput) {
    if (!editingTx) return
    await api().transactions.update(editingTx.id, input)
    toast.success(locale === 'fr' ? 'Transaction modifiee' : 'Transaction updated')
    setEditingTx(null)
    bumpData()
  }

  async function handleDeleteTx(id: number) {
    if (
      !confirm(
        locale === 'fr'
          ? 'Supprimer cette transaction ?'
          : 'Delete this transaction?',
      )
    )
      return
    try {
      await api().transactions.delete(id)
      toast.success(
        locale === 'fr' ? 'Transaction supprimee' : 'Transaction deleted',
      )
      bumpData()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function openLink(url: string) {
    try {
      await api().shell.openExternal(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  if (!symbol) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle>
              {locale === 'fr' ? 'Aucun ticker' : 'No ticker'}
            </CardTitle>
            <CardDescription>
              {locale === 'fr'
                ? 'Utilise un lien depuis Holdings ou Dashboard.'
                : 'Use a link from Holdings or Dashboard.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" size="sm">
              <Link href="/holdings">
                <ArrowLeft />
                Holdings
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const currency = position?.currency ?? profile?.data?.currency ?? 'USD'
  const sectorMeta = position?.sectorCode
    ? sectors.find((s) => s.code === position.sectorCode)
    : null

  return (
    <>
      <Head>
        <title>{`${symbol} · Portfolio Tracker`}</title>
      </Head>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Back link */}
        <div className="flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="h-7 px-2">
            <Link href="/holdings">
              <ArrowLeft />
              Holdings
            </Link>
          </Button>
        </div>

        {/* Hero */}
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-baseline gap-3">
              <h1 className="text-3xl font-semibold tracking-tight font-mono">
                {symbol}
              </h1>
              {profile?.data?.name && (
                <span className="text-base text-muted-foreground">
                  {profile.data.name}
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {sectorMeta && (
                <Badge variant="secondary" className="gap-1">
                  <span
                    className="inline-block size-1.5 rounded-full"
                    style={{ backgroundColor: sectorMeta.color ?? 'currentColor' }}
                  />
                  {locale === 'fr' ? sectorMeta.labelFr : sectorMeta.labelEn}
                </Badge>
              )}
              {profile?.data?.exchange && (
                <span>{profile.data.exchange}</span>
              )}
              {profile?.data?.country && (
                <span>· {profile.data.country}</span>
              )}
              <span>· {currency}</span>
              {profile?.data?.webUrl && (
                <button
                  type="button"
                  onClick={() => profile.data?.webUrl && openLink(profile.data.webUrl)}
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  {locale === 'fr' ? 'Site' : 'Website'}
                  <ExternalLink className="size-3" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <div className="text-right">
              <div className="text-3xl font-semibold tabular-nums">
                {position?.currentPrice !== null && position?.currentPrice !== undefined
                  ? formatMoney(position.currentPrice, currency, lc)
                  : profile?.data
                    ? '—'
                    : '—'}
              </div>
              {position?.changePercent !== null && position?.changePercent !== undefined && (
                <div
                  className={cn(
                    'text-sm tabular-nums font-medium mt-1',
                    position.changePercent > 0 && 'text-positive',
                    position.changePercent < 0 && 'text-negative',
                  )}
                >
                  {position.change !== null && (
                    <>
                      {position.change >= 0 ? '+' : ''}
                      {formatMoney(position.change, currency, lc)}{' '}
                    </>
                  )}
                  ({position.changePercent >= 0 ? '+' : ''}
                  {formatPercent(position.changePercent / 100, lc)})
                </div>
              )}
            </div>
            <Button size="sm" onClick={() => openQuickTrade(symbol)}>
              <Plus className="size-3.5" />
              {locale === 'fr' ? 'Transaction' : 'Trade'}
            </Button>
          </div>
        </header>

        {/* Position KPIs */}
        {loading && !position ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        ) : position ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MiniKpi
              label={locale === 'fr' ? 'Quantite' : 'Quantity'}
              value={formatNumber(position.quantity, lc, 4)}
            />
            <MiniKpi
              label={locale === 'fr' ? 'Cout moyen' : 'Avg cost'}
              value={formatMoney(position.avgCost, currency, lc)}
              sub={`${formatMoney(position.costBasis, displayCurrency, lc)} (${displayCurrency})`}
            />
            <MiniKpi
              label={locale === 'fr' ? 'Valeur marche' : 'Market value'}
              value={formatMoney(position.marketValue, displayCurrency, lc)}
              sub={`${formatNumber(position.weight, lc, 1)}% ${locale === 'fr' ? 'du portefeuille' : 'of portfolio'}`}
            />
            <MiniKpi
              label="P&L"
              value={`${position.pnl >= 0 ? '+' : ''}${formatMoney(position.pnl, displayCurrency, lc)}`}
              sub={`${position.pnlPct >= 0 ? '+' : ''}${formatPercent(position.pnlPct / 100, lc)}`}
              tone={position.pnl > 0 ? 'positive' : position.pnl < 0 ? 'negative' : 'muted'}
            />
          </div>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {locale === 'fr'
                  ? 'Aucune position pour ce ticker'
                  : 'No position for this ticker'}
              </CardTitle>
              <CardDescription>
                {locale === 'fr'
                  ? "Clique sur Transaction pour en ouvrir une."
                  : 'Click Trade to open one.'}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {/* Main grid: chart + sidebar (sector context) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <CardTitle className="text-base">
                    {locale === 'fr' ? 'Cours' : 'Price'}
                  </CardTitle>
                  <CardDescription className="text-xs">
                    {history?.fetchedAt
                      ? `${locale === 'fr' ? 'Donnees' : 'Data'} · ${formatRelativeTime(history.fetchedAt, locale)}${history.stale ? ` · ${t('common.stale').toLowerCase()}` : ''}`
                      : locale === 'fr'
                        ? 'Pas de cache historique'
                        : 'No historical cache'}
                  </CardDescription>
                </div>
                <Tabs value={period} onValueChange={(v) => setPeriod(v as HistoryPeriod)}>
                  <TabsList className="h-7">
                    <TabsTrigger value="1M" className="text-xs h-5 px-2">1M</TabsTrigger>
                    <TabsTrigger value="3M" className="text-xs h-5 px-2">3M</TabsTrigger>
                    <TabsTrigger value="6M" className="text-xs h-5 px-2">6M</TabsTrigger>
                    <TabsTrigger value="1Y" className="text-xs h-5 px-2">1A</TabsTrigger>
                    <TabsTrigger value="ALL" className="text-xs h-5 px-2">
                      {locale === 'fr' ? 'Tout' : 'All'}
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {loading && !history ? (
                <Skeleton className="h-[280px] w-full" />
              ) : (
                <PriceChart
                  candles={history?.data ?? []}
                  currency={currency}
                  locale={locale}
                />
              )}
            </CardContent>
          </Card>

          <SectorContextCard
            sectorAlloc={sectorAlloc}
            position={position}
            targetPct={targetPct}
            displayCurrency={displayCurrency}
            locale={locale}
            sectorMeta={sectorMeta}
          />
        </div>

        {/* ETF look-through: sector composition + top holdings */}
        {etfDetails?.data && (
          <EtfDetailsCard
            details={etfDetails.data}
            sectors={sectors}
            fetchedAt={etfDetails.fetchedAt}
            stale={etfDetails.stale}
          />
        )}

        {/* News + Transactions side by side */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  {locale === 'fr' ? 'Actualites' : 'News'}
                </CardTitle>
                {news?.fetchedAt && (
                  <span className="text-[11px] text-muted-foreground">
                    {formatRelativeTime(news.fetchedAt, locale)}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {!news || news.data.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {locale === 'fr' ? 'Aucune actualite.' : 'No news.'}
                </p>
              ) : (
                news.data.slice(0, 8).map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openLink(n.url)}
                    className="block w-full text-left group"
                  >
                    <div className="flex items-start justify-between gap-3 py-2 border-b border-border last:border-0">
                      <div className="flex-1 min-w-0 space-y-1">
                        <p className="text-sm font-medium leading-snug group-hover:text-primary transition-colors line-clamp-2">
                          {n.headline}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {n.source} ·{' '}
                          {new Date(n.publishedAt).toLocaleDateString(lc)}
                        </p>
                      </div>
                      <ArrowUpRight className="size-3.5 text-muted-foreground group-hover:text-primary transition-colors shrink-0 mt-1" />
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {locale === 'fr' ? 'Transactions' : 'Transactions'}
              </CardTitle>
              <CardDescription className="text-xs">
                {transactions.length}{' '}
                {locale === 'fr' ? 'enregistree(s)' : 'recorded'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md border border-border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Date</TableHead>
                      <TableHead>{t('tx.fields.kind')}</TableHead>
                      <TableHead className="text-right">{t('tx.fields.quantity')}</TableHead>
                      <TableHead className="text-right">{t('tx.fields.price')}</TableHead>
                      <TableHead className="text-right"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.length === 0 && (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={5} className="text-center py-6 text-muted-foreground text-sm">
                          {locale === 'fr' ? 'Aucune transaction.' : 'No transactions.'}
                        </TableCell>
                      </TableRow>
                    )}
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="tabular-nums text-xs">
                          {tx.occurredAt}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] h-5',
                              tx.kind === 'buy'
                                ? 'bg-positive/10 text-positive border-positive/30'
                                : 'bg-negative/10 text-negative border-negative/30',
                            )}
                          >
                            {tx.kind === 'buy' ? t('tx.fields.buy') : t('tx.fields.sell')}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {formatNumber(tx.quantity, lc, 4)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-xs">
                          {formatMoney(tx.price, tx.currency, lc)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => setEditingTx(tx)}
                              aria-label="Edit"
                            >
                              <Pencil />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              onClick={() => handleDeleteTx(tx.id)}
                              aria-label="Delete"
                              className="hover:text-negative"
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <TransactionForm
        open={!!editingTx}
        onClose={() => setEditingTx(null)}
        editing={editingTx}
        onSubmit={handleUpdateTx}
      />
    </>
  )
}

interface MiniKpiProps {
  label: string
  value: string
  sub?: string
  tone?: 'positive' | 'negative' | 'muted'
}

function MiniKpi({ label, value, sub, tone }: MiniKpiProps) {
  return (
    <div className="rounded-lg border border-border bg-card p-3.5">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div
        className={cn(
          'text-xl font-semibold tabular-nums mt-1',
          tone === 'positive' && 'text-positive',
          tone === 'negative' && 'text-negative',
        )}
      >
        {value}
      </div>
      {sub && (
        <div
          className={cn(
            'text-[11px] mt-0.5 tabular-nums',
            tone === 'positive' && 'text-positive/80',
            tone === 'negative' && 'text-negative/80',
            !tone && 'text-muted-foreground',
          )}
        >
          {sub}
        </div>
      )}
    </div>
  )
}

interface SectorContextCardProps {
  sectorAlloc: PortfolioOverview['sectors'][number] | null
  position: PortfolioOverview['positions'][number] | null
  targetPct: number | null
  displayCurrency: 'CAD' | 'USD'
  locale: 'fr' | 'en'
  sectorMeta: Sector | null | undefined
}

function SectorContextCard({
  sectorAlloc,
  position,
  targetPct,
  displayCurrency,
  locale,
  sectorMeta,
}: SectorContextCardProps) {
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'

  if (!sectorAlloc || !position) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Target className="size-4 text-primary" />
            {locale === 'fr' ? 'Contexte secteur' : 'Sector context'}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {locale === 'fr'
            ? 'Assigne un secteur a ce ticker pour voir le contexte.'
            : 'Assign a sector to see context.'}
        </CardContent>
      </Card>
    )
  }

  const sectorPct = sectorAlloc.percent
  const positionShareOfSector =
    sectorAlloc.value > 0 ? (position.marketValue / sectorAlloc.value) * 100 : 0
  const targetDelta = targetPct !== null ? sectorPct - targetPct : null

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Target className="size-4 text-primary" />
          {locale === 'fr' ? 'Contexte secteur' : 'Sector context'}
        </CardTitle>
        <CardDescription className="text-xs">
          <span
            className="inline-block size-2 rounded-full mr-1.5 align-middle"
            style={{ backgroundColor: sectorMeta?.color ?? 'currentColor' }}
          />
          {locale === 'fr' ? sectorMeta?.labelFr : sectorMeta?.labelEn}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        <div>
          <div className="flex justify-between text-muted-foreground text-xs mb-1">
            <span>
              {locale === 'fr' ? 'Part du portefeuille' : 'Portfolio share'}
            </span>
            <span className="tabular-nums">
              {formatNumber(sectorPct, lc, 1)}%
              {targetPct !== null && (
                <span className="text-muted-foreground">
                  {' '}
                  / {formatNumber(targetPct, lc, 1)}%
                </span>
              )}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden relative">
            <div
              className="h-full bg-primary"
              style={{
                width: `${Math.min(100, sectorPct)}%`,
                backgroundColor: sectorMeta?.color ?? undefined,
              }}
            />
            {targetPct !== null && (
              <div
                className="absolute top-0 bottom-0 w-px bg-foreground/60"
                style={{ left: `${Math.min(100, targetPct)}%` }}
                title={`Target ${formatNumber(targetPct, lc, 1)}%`}
              />
            )}
          </div>
          {targetDelta !== null && (
            <div className="mt-1 text-[11px] text-muted-foreground">
              {Math.abs(targetDelta) < 0.5 ? (
                <span className="text-positive">
                  ✓ {locale === 'fr' ? 'sur la cible' : 'on target'}
                </span>
              ) : targetDelta > 0 ? (
                <span className="text-amber-500">
                  +{formatNumber(targetDelta, lc, 1)} pp{' '}
                  {locale === 'fr' ? 'au-dessus' : 'over'}
                </span>
              ) : (
                <span className="text-blue-400">
                  {formatNumber(targetDelta, lc, 1)} pp{' '}
                  {locale === 'fr' ? 'sous la cible' : 'under target'}
                </span>
              )}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <div className="text-muted-foreground">
              {locale === 'fr' ? 'Valeur secteur' : 'Sector value'}
            </div>
            <div className="tabular-nums font-medium mt-0.5">
              {formatMoney(sectorAlloc.value, displayCurrency, lc)}
            </div>
          </div>
          <div>
            <div className="text-muted-foreground">
              {locale === 'fr'
                ? 'Ce ticker dans le secteur'
                : 'This ticker in sector'}
            </div>
            <div className="tabular-nums font-medium mt-0.5">
              {formatNumber(positionShareOfSector, lc, 1)}%
            </div>
          </div>
        </div>

        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href="/rebalance">
            {locale === 'fr' ? 'Voir le reequilibrage' : 'Open rebalance'}
            <ArrowUpRight className="size-3.5" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
