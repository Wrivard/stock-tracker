import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ArrowUpRight, Camera, ListFilter } from 'lucide-react'

import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { formatMoney, formatNumber } from '@/lib/format'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { KpiCard } from '@/components/dashboard/KpiCard'
import { PortfolioPerformanceChart } from '@/components/dashboard/PortfolioPerformanceChart'
import type { Transaction } from '../../main/db/types'

const ALL_TICKERS = '__all__'

export default function HistoryPage() {
  const { t, locale } = useT()
  const refreshTick = useUi((s) => s.refreshTick)
  const dataTick = useUi((s) => s.dataTick)
  const initialized = useUi((s) => s.initialized)

  const [txs, setTxs] = useState<Transaction[]>([])
  const [snapshotsCount, setSnapshotsCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [capturing, setCapturing] = useState(false)
  const [tickerFilter, setTickerFilter] = useState<string>(ALL_TICKERS)

  const reload = async () => {
    setLoading(true)
    try {
      const [txList, snaps] = await Promise.all([
        api().transactions.list(),
        api().snapshots.list(),
      ])
      setTxs(txList)
      setSnapshotsCount(snaps.length)
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
  }, [initialized, refreshTick, dataTick])

  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'

  // Aggregate stats over ALL transactions, not the filtered list — the
  // KPIs read as portfolio-wide regardless of which ticker the user has
  // picked in the table filter below.
  const stats = useMemo(() => {
    const buys = txs.filter((t) => t.kind === 'buy').length
    const sells = txs.filter((t) => t.kind === 'sell').length
    const distinctTickers = new Set(txs.map((t) => t.ticker)).size
    // listTransactions returns DESC by occurred_at + id; the LAST entry
    // is therefore the oldest.
    const firstTrade = txs[txs.length - 1]?.occurredAt ?? null
    const lastTrade = txs[0]?.occurredAt ?? null
    return {
      total: txs.length,
      buys,
      sells,
      distinctTickers,
      firstTrade,
      lastTrade,
    }
  }, [txs])

  // Ticker list for the filter Select — drawn from the transactions
  // themselves so it includes positions the user has fully sold too.
  // That's intentional on the History page: "what did I trade", not
  // "what do I currently hold".
  const tickerOptions = useMemo(() => {
    const set = new Set<string>()
    for (const tx of txs) set.add(tx.ticker)
    return Array.from(set).sort()
  }, [txs])

  const filteredTxs = useMemo(() => {
    if (tickerFilter === ALL_TICKERS) return txs
    return txs.filter((tx) => tx.ticker === tickerFilter)
  }, [txs, tickerFilter])

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
        <title>{`${t('history.title')} · Beta Trading Hub`}</title>
      </Head>
      <div className="p-6 max-w-7xl mx-auto space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t('history.title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {locale === 'fr'
                ? 'Evolution du portefeuille et historique complet des transactions.'
                : 'Portfolio evolution and full transaction history.'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCapture}
            disabled={capturing}
            title={
              locale === 'fr'
                ? `${snapshotsCount} snapshot(s) en base`
                : `${snapshotsCount} snapshot(s) on file`
            }
          >
            <Camera className="size-3.5" />
            {capturing
              ? t('common.refreshing')
              : locale === 'fr'
                ? 'Snapshot'
                : 'Snapshot'}
          </Button>
        </header>

        {/* Same reconstruction-based chart as the Dashboard. Works on a
            fresh install because it walks the txs ledger + history cache
            rather than depending on snapshots. */}
        <PortfolioPerformanceChart locale={locale} />

        {/* Lifetime activity KPIs. Computed over the full txs list, not
            the table filter. */}
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          <KpiCard
            title={locale === 'fr' ? 'Transactions' : 'Trades'}
            value={loading ? '…' : String(stats.total)}
            hint={
              loading
                ? ''
                : locale === 'fr'
                  ? `${stats.buys} achats · ${stats.sells} ventes`
                  : `${stats.buys} buys · ${stats.sells} sells`
            }
          />
          <KpiCard
            title={locale === 'fr' ? 'Tickers traites' : 'Tickers traded'}
            value={loading ? '…' : String(stats.distinctTickers)}
            hint={
              loading
                ? ''
                : locale === 'fr'
                  ? 'historique complet'
                  : 'lifetime'
            }
          />
          <KpiCard
            title={locale === 'fr' ? 'Premiere transaction' : 'First trade'}
            value={
              loading
                ? '…'
                : stats.firstTrade ??
                  (locale === 'fr' ? 'Aucune' : 'None')
            }
          />
          <KpiCard
            title={locale === 'fr' ? 'Derniere transaction' : 'Latest trade'}
            value={
              loading
                ? '…'
                : stats.lastTrade ??
                  (locale === 'fr' ? 'Aucune' : 'None')
            }
            hint={
              loading
                ? ''
                : locale === 'fr'
                  ? `${snapshotsCount} snapshot(s)`
                  : `${snapshotsCount} snapshot(s)`
            }
          />
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base">
                  {locale === 'fr'
                    ? 'Toutes les transactions'
                    : 'All transactions'}
                </CardTitle>
                <CardDescription className="text-xs">
                  {loading
                    ? '…'
                    : tickerFilter === ALL_TICKERS
                      ? locale === 'fr'
                        ? `${filteredTxs.length} entree(s)`
                        : `${filteredTxs.length} row(s)`
                      : locale === 'fr'
                        ? `${filteredTxs.length} entree(s) pour ${tickerFilter}`
                        : `${filteredTxs.length} row(s) for ${tickerFilter}`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <ListFilter
                  className="size-3.5 text-muted-foreground"
                  aria-hidden
                />
                <Select
                  key={tickerFilter}
                  value={tickerFilter}
                  onValueChange={setTickerFilter}
                >
                  <SelectTrigger className="w-[180px] h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_TICKERS}>
                      {locale === 'fr' ? 'Tous les tickers' : 'All tickers'}
                    </SelectItem>
                    {tickerOptions.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>
                    {locale === 'fr' ? 'Date' : 'Date'}
                  </TableHead>
                  <TableHead>{locale === 'fr' ? 'Type' : 'Kind'}</TableHead>
                  <TableHead>{locale === 'fr' ? 'Ticker' : 'Ticker'}</TableHead>
                  <TableHead className="text-right">
                    {locale === 'fr' ? 'Quantite' : 'Quantity'}
                  </TableHead>
                  <TableHead className="text-right">
                    {locale === 'fr' ? 'Prix' : 'Price'}
                  </TableHead>
                  <TableHead className="text-right">
                    {locale === 'fr' ? 'Frais' : 'Fees'}
                  </TableHead>
                  <TableHead className="text-right">
                    {locale === 'fr' ? 'Total' : 'Total'}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={7}
                      className="text-center text-sm text-muted-foreground py-10"
                    >
                      …
                    </TableCell>
                  </TableRow>
                )}
                {!loading && filteredTxs.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={7}
                      className="text-center text-sm text-muted-foreground py-10"
                    >
                      {locale === 'fr'
                        ? 'Aucune transaction.'
                        : 'No transactions.'}
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  filteredTxs.map((tx) => {
                    const gross = tx.quantity * tx.price
                    const total =
                      tx.kind === 'buy'
                        ? gross + (tx.fees ?? 0)
                        : gross - (tx.fees ?? 0)
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono tabular-nums text-xs">
                          {tx.occurredAt}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={cn(
                              'text-[10px] h-5 px-1.5 font-normal',
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
                        </TableCell>
                        <TableCell className="font-mono font-medium">
                          <Link
                            href={{
                              pathname: '/ticker',
                              query: { symbol: tx.ticker },
                            }}
                            className="hover:text-primary transition-colors inline-flex items-center gap-1"
                          >
                            {tx.ticker}
                            <ArrowUpRight className="size-3 opacity-60" />
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(tx.quantity, lc, 4)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatMoney(tx.price, tx.currency, lc)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {tx.fees
                            ? formatMoney(tx.fees, tx.currency, lc)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">
                          {formatMoney(total, tx.currency, lc)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
