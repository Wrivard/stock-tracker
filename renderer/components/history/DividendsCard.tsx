import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Coins, Plus, Trash2 } from 'lucide-react'

import type {
  Account,
  Currency,
  Dividend,
  DividendInput,
  DividendKind,
} from '../../../main/db/types'
import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT } from '@/lib/i18n'
import type { TKey } from '@/lib/i18n'
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatMoney } from '@/lib/format'

interface DividendsCardProps {
  accounts: Account[]
  // Display currency from the store, used as the default for the
  // "Total received" KPI conversion. We don't have a real FX-aware
  // total here (mixing CAD + USD dividends would need conversion);
  // instead we render two separate totals when both currencies appear.
  locale: 'fr' | 'en'
}

interface FormState {
  ticker: string
  amount: string
  currency: Currency
  paidAt: string
  kind: DividendKind
  accountId: string  // store as string for Select compat
}

const EMPTY_FORM = (): FormState => ({
  ticker: '',
  amount: '',
  currency: 'CAD',
  paidAt: new Date().toISOString().slice(0, 10),
  kind: 'dividend',
  accountId: '__none__',
})

function kindLabelKey(kind: DividendKind): TKey {
  return `dividends.kind.${kind}` as TKey
}

export function DividendsCard({ accounts, locale }: DividendsCardProps) {
  const { t } = useT()
  const dataTick = useUi((s) => s.dataTick)
  const bumpData = useUi((s) => s.bumpData)
  const initialized = useUi((s) => s.initialized)

  const [dividends, setDividends] = useState<Dividend[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM())
  const [submitting, setSubmitting] = useState(false)
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'

  const reload = async () => {
    setLoading(true)
    try {
      const list = await api().dividends.list()
      setDividends(list)
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
  }, [initialized, dataTick])

  // Per-currency totals so a mixed CAD/USD portfolio doesn't get a
  // bogus single number. The "total received" badge shows both when
  // both currencies appear.
  const totals = useMemo(() => {
    const now = Date.now()
    const yearStart = new Date(new Date().getFullYear(), 0, 1)
      .toISOString()
      .slice(0, 10)
    const twelveMoAgoMs = now - 365 * 86_400_000
    const byCcy: Record<Currency, { all: number; ytd: number; last12: number }> = {
      CAD: { all: 0, ytd: 0, last12: 0 },
      USD: { all: 0, ytd: 0, last12: 0 },
    }
    for (const d of dividends) {
      const bucket = byCcy[d.currency]
      bucket.all += d.amount
      if (d.paidAt >= yearStart) bucket.ytd += d.amount
      if (new Date(d.paidAt + 'T00:00:00Z').getTime() >= twelveMoAgoMs) {
        bucket.last12 += d.amount
      }
    }
    return byCcy
  }, [dividends])

  const accountNameById = useMemo(() => {
    const m = new Map<number, string>()
    for (const a of accounts) m.set(a.id, a.name)
    return m
  }, [accounts])

  const perTicker = useMemo(() => {
    const m = new Map<string, { ticker: string; total: number; ccy: Currency; count: number }>()
    for (const d of dividends) {
      const key = (d.ticker ?? '—') + '/' + d.currency
      const e = m.get(key)
      if (e) {
        e.total += d.amount
        e.count++
      } else {
        m.set(key, {
          ticker: d.ticker ?? '—',
          total: d.amount,
          ccy: d.currency,
          count: 1,
        })
      }
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total)
  }, [dividends])

  function openCreate() {
    setForm(EMPTY_FORM())
    setDialogOpen(true)
  }

  async function handleSubmit() {
    const amount = parseFloat(form.amount.replace(',', '.'))
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error(locale === 'fr' ? 'Montant invalide.' : 'Invalid amount.')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.paidAt)) {
      toast.error(locale === 'fr' ? 'Date invalide.' : 'Invalid date.')
      return
    }
    setSubmitting(true)
    try {
      const input: DividendInput = {
        ticker: form.ticker.trim().toUpperCase() || null,
        accountId:
          form.accountId === '__none__' ? null : Number(form.accountId),
        amount,
        currency: form.currency,
        paidAt: form.paidAt,
        kind: form.kind,
        source: 'manual',
      }
      await api().dividends.create(input)
      bumpData()
      setDialogOpen(false)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(d: Dividend) {
    if (
      !window.confirm(
        locale === 'fr'
          ? `Supprimer ce dividende du ${d.paidAt} ?`
          : `Delete the dividend from ${d.paidAt}?`,
      )
    )
      return
    try {
      await api().dividends.delete(d.id)
      bumpData()
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Coins className="size-4 text-primary" />
                {t('dividends.title')}
              </CardTitle>
              <CardDescription className="text-xs">
                {t('dividends.subtitle')}
              </CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={openCreate}>
              <Plus className="size-3.5" />
              {t('dividends.add')}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* KPIs — split by currency so the totals are honest. Render
              only the buckets that have any value. */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {(['CAD', 'USD'] as const).flatMap((ccy) => {
              if (totals[ccy].all === 0) return []
              return [
                <div
                  key={`tot-${ccy}`}
                  className="rounded-lg border border-border bg-card p-3"
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t('dividends.total')} ({ccy})
                  </div>
                  <div className="text-lg font-semibold tabular-nums truncate mt-1">
                    {formatMoney(totals[ccy].all, ccy, lc)}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                    {t('dividends.last12mo')}:{' '}
                    {formatMoney(totals[ccy].last12, ccy, lc)} ·{' '}
                    {t('dividends.thisYear')}:{' '}
                    {formatMoney(totals[ccy].ytd, ccy, lc)}
                  </div>
                </div>,
              ]
            })}
            <div className="rounded-lg border border-border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {t('dividends.count')}
              </div>
              <div className="text-lg font-semibold tabular-nums mt-1">
                {loading ? '…' : dividends.length}
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">
                {locale === 'fr' ? 'historique complet' : 'lifetime'}
              </div>
            </div>
          </div>

          {/* Per-ticker breakdown */}
          {!loading && perTicker.length > 0 && (
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>
                      {locale === 'fr' ? 'Ticker' : 'Ticker'}
                    </TableHead>
                    <TableHead className="text-right">
                      {t('dividends.count')}
                    </TableHead>
                    <TableHead className="text-right">
                      {t('dividends.total')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perTicker.slice(0, 10).map((row) => (
                    <TableRow key={row.ticker + '/' + row.ccy}>
                      <TableCell className="font-mono font-medium">
                        {row.ticker !== '—' ? (
                          <Link
                            href={{
                              pathname: '/ticker',
                              query: { symbol: row.ticker },
                            }}
                            className="hover:text-primary transition-colors"
                          >
                            {row.ticker}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums font-medium">
                        {formatMoney(row.total, row.ccy, lc)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* Recent payments */}
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : dividends.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              {t('dividends.empty')}
            </p>
          ) : (
            <div className="rounded-lg border border-border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>
                      {t('dividends.fields.paidAt')}
                    </TableHead>
                    <TableHead>
                      {locale === 'fr' ? 'Ticker' : 'Ticker'}
                    </TableHead>
                    <TableHead>{t('dividends.fields.kind')}</TableHead>
                    {accounts.length > 0 && (
                      <TableHead>{t('dividends.fields.account')}</TableHead>
                    )}
                    <TableHead className="text-right">
                      {t('dividends.fields.amount')}
                    </TableHead>
                    <TableHead className="w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dividends.slice(0, 20).map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-mono tabular-nums text-xs">
                        {d.paidAt}
                      </TableCell>
                      <TableCell className="font-mono font-medium">
                        {d.ticker ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-[10px] h-5">
                          {t(kindLabelKey(d.kind))}
                        </Badge>
                      </TableCell>
                      {accounts.length > 0 && (
                        <TableCell className="text-xs">
                          {d.accountId !== null &&
                          accountNameById.has(d.accountId) ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-5"
                            >
                              {accountNameById.get(d.accountId)}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      )}
                      <TableCell className="text-right tabular-nums font-medium text-positive">
                        +{formatMoney(d.amount, d.currency, lc)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          onClick={() => handleDelete(d)}
                          aria-label="delete"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {dividends.length > 20 && (
                <p className="text-[10px] text-muted-foreground text-center py-2">
                  {locale === 'fr'
                    ? `+${dividends.length - 20} autres paiements`
                    : `+${dividends.length - 20} more payments`}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('dividends.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="div-ticker">
                  {t('dividends.fields.ticker')}
                </Label>
                <Input
                  id="div-ticker"
                  value={form.ticker}
                  onChange={(e) =>
                    setForm({ ...form, ticker: e.target.value })
                  }
                  placeholder="AAPL"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t('dividends.fields.kind')}</Label>
                <Select
                  key={form.kind}
                  value={form.kind}
                  onValueChange={(v) =>
                    setForm({ ...form, kind: v as DividendKind })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dividend">
                      {t('dividends.kind.dividend')}
                    </SelectItem>
                    <SelectItem value="interest">
                      {t('dividends.kind.interest')}
                    </SelectItem>
                    <SelectItem value="distribution">
                      {t('dividends.kind.distribution')}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="div-amount">
                  {t('dividends.fields.amount')}
                </Label>
                <Input
                  id="div-amount"
                  type="text"
                  inputMode="decimal"
                  value={form.amount}
                  onChange={(e) =>
                    setForm({ ...form, amount: e.target.value })
                  }
                  placeholder="12.34"
                />
              </div>
              <div className="grid gap-1.5">
                <Label>{t('dividends.fields.currency')}</Label>
                <Select
                  key={form.currency}
                  value={form.currency}
                  onValueChange={(v) =>
                    setForm({ ...form, currency: v as Currency })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="div-date">
                  {t('dividends.fields.paidAt')}
                </Label>
                <Input
                  id="div-date"
                  type="date"
                  value={form.paidAt}
                  onChange={(e) =>
                    setForm({ ...form, paidAt: e.target.value })
                  }
                />
              </div>
              {accounts.length > 0 && (
                <div className="grid gap-1.5">
                  <Label>{t('dividends.fields.account')}</Label>
                  <Select
                    key={form.accountId}
                    value={form.accountId}
                    onValueChange={(v) =>
                      setForm({ ...form, accountId: v })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">—</SelectItem>
                      {accounts.map((a) => (
                        <SelectItem key={a.id} value={String(a.id)}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit} disabled={submitting}>
              {submitting ? '…' : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
