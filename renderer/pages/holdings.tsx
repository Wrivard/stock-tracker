import Head from 'next/head'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  Pencil,
  Plus,
  Tag,
  Trash2,
} from 'lucide-react'

import type {
  Transaction,
  TransactionInput,
} from '../../main/db/types'
import type { PortfolioOverview } from '../../main/services/portfolio'
import { api, useApiResource } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { formatMoney, formatNumber, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { SectorPicker } from '@/components/holdings/SectorPicker'
import { TransactionForm } from '@/components/holdings/TransactionForm'

export default function HoldingsPage() {
  const { t, locale } = useT()
  const displayCurrency = useUi((s) => s.displayCurrency)
  const refreshTick = useUi((s) => s.refreshTick)
  const initialized = useUi((s) => s.initialized)

  const [overview, setOverview] = useState<PortfolioOverview | null>(null)
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    try {
      const data = await api().portfolio.overview(displayCurrency)
      setOverview(data)
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
  }, [displayCurrency, refreshTick, initialized])

  const [txDialogOpen, setTxDialogOpen] = useState(false)
  const [editingTx, setEditingTx] = useState<Transaction | null>(null)
  const [detailTicker, setDetailTicker] = useState<string | null>(null)
  const [sectorPickerFor, setSectorPickerFor] = useState<{
    ticker: string
    sectorId: number | null
  } | null>(null)

  async function handleCreateTx(input: TransactionInput) {
    await api().transactions.create(input)
    toast.success(
      locale === 'fr'
        ? `Transaction ${input.kind} ajoutee pour ${input.ticker}`
        : `${input.kind === 'buy' ? 'Buy' : 'Sell'} added for ${input.ticker}`,
    )
    await reload()
  }

  async function handleUpdateTx(input: TransactionInput) {
    if (!editingTx) return
    await api().transactions.update(editingTx.id, input)
    toast.success(locale === 'fr' ? 'Transaction modifiee' : 'Transaction updated')
    setEditingTx(null)
    await reload()
  }

  async function handleDeleteTicker(symbol: string) {
    if (
      !confirm(
        locale === 'fr'
          ? `Supprimer ${symbol} et toutes ses transactions ?`
          : `Delete ${symbol} and all its transactions?`,
      )
    ) {
      return
    }
    try {
      await api().tickers.delete(symbol)
      toast.success(
        locale === 'fr' ? `${symbol} supprime` : `${symbol} deleted`,
      )
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'

  return (
    <>
      <Head>
        <title>{`${t('holdings.title')} · Portfolio Tracker`}</title>
      </Head>
      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t('holdings.title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {t('holdings.subtitle')}
            </p>
          </div>
          <Button onClick={() => setTxDialogOpen(true)}>
            <Plus />
            {t('holdings.addTx')}
          </Button>
        </header>

        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('holdings.col.ticker')}</TableHead>
                <TableHead>{t('holdings.col.name')}</TableHead>
                <TableHead>{t('holdings.col.sector')}</TableHead>
                <TableHead className="text-right">{t('holdings.col.quantity')}</TableHead>
                <TableHead className="text-right">{t('holdings.col.avgCost')}</TableHead>
                <TableHead className="text-right">{t('holdings.col.price')}</TableHead>
                <TableHead className="text-right">{t('holdings.col.dayChange')}</TableHead>
                <TableHead className="text-right">{t('holdings.col.marketValue')}</TableHead>
                <TableHead className="text-right">{t('holdings.col.pnl')}</TableHead>
                <TableHead className="text-right">{t('holdings.col.weight')}</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && !overview && (
                <>
                  {Array.from({ length: 4 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={11}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))}
                </>
              )}
              {overview && overview.positions.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    {t('holdings.empty')}
                  </TableCell>
                </TableRow>
              )}
              {overview &&
                overview.positions.map((p) => (
                  <TableRow key={p.ticker}>
                    <TableCell className="font-mono font-medium">
                      <button
                        type="button"
                        className="hover:underline text-left"
                        onClick={() => setDetailTicker(p.ticker)}
                      >
                        {p.ticker}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-[180px] truncate">
                      {p.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() =>
                          setSectorPickerFor({
                            ticker: p.ticker,
                            sectorId: p.sectorId,
                          })
                        }
                        className="flex items-center gap-1"
                      >
                        {p.sectorCode ? (
                          <Badge variant="secondary">
                            {locale === 'fr' ? p.sectorLabelFr : p.sectorLabelEn}
                          </Badge>
                        ) : (
                          <Badge variant="outline">
                            <Tag className="size-3" />
                            {locale === 'fr' ? 'Assigner' : 'Assign'}
                          </Badge>
                        )}
                      </button>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(p.quantity, lc, 4)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatMoney(p.avgCost, p.currency, lc)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.currentPrice !== null ? (
                        <span
                          className={cn(
                            p.quoteStale && 'text-muted-foreground italic',
                          )}
                          title={
                            p.quoteStale
                              ? locale === 'fr'
                                ? 'Donnees periees'
                                : 'Stale data'
                              : undefined
                          }
                        >
                          {formatMoney(p.currentPrice, p.currency, lc)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {p.changePercent !== null ? (
                        <span
                          className={cn(
                            p.changePercent > 0 && 'text-emerald-500',
                            p.changePercent < 0 && 'text-red-500',
                          )}
                        >
                          {p.changePercent >= 0 ? '+' : ''}
                          {formatPercent(p.changePercent / 100, lc)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(p.marketValue, overview.displayCurrency, lc)}
                    </TableCell>
                    <TableCell
                      className={cn(
                        'text-right tabular-nums',
                        p.pnl > 0 && 'text-emerald-500',
                        p.pnl < 0 && 'text-red-500',
                      )}
                    >
                      {p.pnl >= 0 ? '+' : ''}
                      {formatMoney(p.pnl, overview.displayCurrency, lc)}
                      <div className="text-xs opacity-70">
                        {p.pnlPct >= 0 ? '+' : ''}
                        {formatPercent(p.pnlPct / 100, lc)}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {formatNumber(p.weight, lc, 1)}%
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDeleteTicker(p.ticker)}
                        aria-label={`Delete ${p.ticker}`}
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <TransactionForm
        open={txDialogOpen}
        onClose={() => setTxDialogOpen(false)}
        onSubmit={handleCreateTx}
      />

      <TransactionForm
        open={!!editingTx}
        onClose={() => setEditingTx(null)}
        editing={editingTx}
        onSubmit={handleUpdateTx}
      />

      <TransactionsDialog
        ticker={detailTicker}
        onClose={() => setDetailTicker(null)}
        onChanged={reload}
        onEdit={(tx) => {
          setDetailTicker(null)
          setEditingTx(tx)
        }}
      />

      <SectorPicker
        ticker={sectorPickerFor?.ticker ?? null}
        currentSectorId={sectorPickerFor?.sectorId ?? null}
        onClose={() => setSectorPickerFor(null)}
        onChanged={reload}
      />
    </>
  )
}

interface TransactionsDialogProps {
  ticker: string | null
  onClose: () => void
  onChanged: () => Promise<void>
  onEdit: (tx: Transaction) => void
}

function TransactionsDialog({
  ticker,
  onClose,
  onChanged,
  onEdit,
}: TransactionsDialogProps) {
  const { t, locale } = useT()
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'
  const { data: txs, loading, refetch } = useApiResource<Transaction[]>(
    () => (ticker ? api().transactions.list({ ticker }) : Promise.resolve([])),
    [ticker],
  )

  async function handleDelete(id: number) {
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
      await refetch()
      await onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <Dialog open={!!ticker} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('tx.titleFor', { ticker: ticker ?? '' })}</DialogTitle>
          <DialogDescription>
            {locale === 'fr'
              ? 'Historique des achats / ventes pour ce ticker.'
              : 'Buy / sell history for this ticker.'}
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border max-h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>{t('tx.fields.kind')}</TableHead>
                <TableHead className="text-right">{t('tx.fields.quantity')}</TableHead>
                <TableHead className="text-right">{t('tx.fields.price')}</TableHead>
                <TableHead className="text-right">{t('tx.fields.fees')}</TableHead>
                <TableHead>{t('tx.fields.currency')}</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-4">
                    {t('common.loading')}
                  </TableCell>
                </TableRow>
              )}
              {!loading && txs && txs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                    {locale === 'fr' ? 'Aucune transaction.' : 'No transactions.'}
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                txs &&
                txs.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell className="tabular-nums">{tx.occurredAt}</TableCell>
                    <TableCell>
                      <Badge variant={tx.kind === 'buy' ? 'default' : 'secondary'}>
                        {tx.kind === 'buy' ? t('tx.fields.buy') : t('tx.fields.sell')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(tx.quantity, lc, 4)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(tx.price, tx.currency, lc)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(tx.fees, tx.currency, lc)}
                    </TableCell>
                    <TableCell>{tx.currency}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => onEdit(tx)}
                        aria-label="Edit"
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(tx.id)}
                        aria-label="Delete"
                      >
                        <Trash2 />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  )
}
