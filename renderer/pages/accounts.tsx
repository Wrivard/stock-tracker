import Head from 'next/head'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import type {
  Account,
  AccountInput,
  AccountKind,
  Currency,
  Transaction,
} from '../../main/db/types'
import { api } from '@/lib/api'
import { formatMoney, todayIsoDate } from '@/lib/format'
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

const ACCOUNT_KINDS: AccountKind[] = [
  'tfsa',
  'rrsp',
  'fhsa',
  'lira',
  'resp',
  'taxable',
  'other',
]

function kindLabelKey(kind: AccountKind): TKey {
  return `accounts.kind.${kind}` as TKey
}

interface FormState {
  name: string
  kind: AccountKind
  brokerAccountNumber: string
  defaultCurrency: Currency | ''
  annualLimit: string
}

const EMPTY_FORM: FormState = {
  name: '',
  kind: 'taxable',
  brokerAccountNumber: '',
  defaultCurrency: '',
  annualLimit: '',
}

// Standard FHSA yearly contribution cap (CAD). Prefilled when the user
// picks the FHSA kind and hasn't typed a limit of their own.
const FHSA_ANNUAL_LIMIT = 8000

function formFromAccount(a: Account): FormState {
  return {
    name: a.name,
    kind: a.kind,
    brokerAccountNumber: a.brokerAccountNumber ?? '',
    defaultCurrency: a.defaultCurrency ?? '',
    annualLimit:
      a.annualContributionLimit != null
        ? String(a.annualContributionLimit)
        : '',
  }
}

function formToInput(f: FormState): AccountInput {
  const parsed = Number(f.annualLimit.replace(',', '.'))
  const annualContributionLimit =
    f.annualLimit.trim() !== '' && Number.isFinite(parsed) && parsed > 0
      ? parsed
      : null
  return {
    name: f.name.trim(),
    kind: f.kind,
    brokerAccountNumber: f.brokerAccountNumber.trim() || null,
    defaultCurrency: f.defaultCurrency || null,
    annualContributionLimit,
  }
}

export default function AccountsPage() {
  const { t, locale } = useT()
  const initialized = useUi((s) => s.initialized)
  const dataTick = useUi((s) => s.dataTick)
  const bumpData = useUi((s) => s.bumpData)

  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Account | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  // USD→CAD rate to normalize USD buys against the CAD contribution
  // caps. Defaults to 1 (no-op) until the rate loads or if it fails,
  // so the numbers degrade to "treated as CAD" rather than breaking.
  const [usdToCad, setUsdToCad] = useState(1)

  const reload = async () => {
    setLoading(true)
    try {
      const [accs, txs, fx] = await Promise.all([
        api().accounts.list(),
        api().transactions.list(),
        api()
          .market.fxRate('USD', 'CAD')
          .catch(() => null),
      ])
      setAccounts(accs)
      setTransactions(txs)
      const rate = fx?.data?.rate
      if (rate && rate > 0) setUsdToCad(rate)
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

  // Count transactions per account (and per "unassigned") so the table
  // shows the user how many of their trades are bound to each account.
  // Computed on the full ledger so deletes/imports stay reflected.
  const txCounts = useMemo(() => {
    const counts = new Map<number | null, number>()
    for (const tx of transactions) {
      const k = tx.accountId ?? null
      counts.set(k, (counts.get(k) ?? 0) + 1)
    }
    return counts
  }, [transactions])

  const unassignedCount = txCounts.get(null) ?? 0

  const currentYear = todayIsoDate().slice(0, 4)

  // Sum gross buy cost per account per calendar year, in CAD. Gross =
  // quantity*price + fees; sells are intentionally ignored (a FHSA
  // withdrawal doesn't restore contribution room). USD trades are
  // converted at the current rate. Keyed accountId -> year -> CAD.
  const contribByAccount = useMemo(() => {
    const map = new Map<number, Map<string, number>>()
    for (const tx of transactions) {
      if (tx.kind !== 'buy' || tx.accountId == null) continue
      const year = tx.occurredAt.slice(0, 4)
      const native = tx.quantity * tx.price + (tx.fees ?? 0)
      const cad = tx.currency === 'USD' ? native * usdToCad : native
      let years = map.get(tx.accountId)
      if (!years) {
        years = new Map()
        map.set(tx.accountId, years)
      }
      years.set(year, (years.get(year) ?? 0) + cad)
    }
    return map
  }, [transactions, usdToCad])

  // Accounts the user has given a yearly cap (FHSA gets one by default).
  const trackedAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => a.annualContributionLimit != null && a.annualContributionLimit > 0,
      ),
    [accounts],
  )

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setDialogOpen(true)
  }

  function openEdit(a: Account) {
    setEditing(a)
    setForm(formFromAccount(a))
    setDialogOpen(true)
  }

  async function handleSubmit() {
    if (!form.name.trim()) {
      toast.error(
        locale === 'fr' ? 'Nom requis.' : 'Name is required.',
      )
      return
    }
    setSubmitting(true)
    try {
      if (editing) {
        await api().accounts.update(editing.id, formToInput(form))
      } else {
        await api().accounts.create(formToInput(form))
      }
      bumpData()
      setDialogOpen(false)
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(a: Account) {
    const msg = t('accounts.deleteConfirm')
    // Window.confirm is jarring but the alternative is yet another
    // dialog stack — keeping it simple here. The destructive nature
    // is contained to the row anyway (ON DELETE SET NULL on txs).
    if (!window.confirm(msg)) return
    try {
      await api().accounts.delete(a.id)
      bumpData()
      await reload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <Head>
        <title>{`${t('accounts.title')} · Beta Trading Hub`}</title>
      </Head>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t('accounts.title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {t('accounts.subtitle')}
            </p>
          </div>
          <Button size="sm" onClick={openCreate}>
            <Plus className="size-3.5" />
            {t('accounts.add')}
          </Button>
        </header>

        {!loading && trackedAccounts.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t('accounts.contrib.title')}
              </CardTitle>
              <CardDescription className="text-xs">
                {t('accounts.contrib.subtitle')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              {trackedAccounts.map((a) => {
                const moneyLocale = locale === 'fr' ? 'fr-CA' : 'en-CA'
                const money = (n: number) =>
                  formatMoney(n, 'CAD', moneyLocale)
                const limit = a.annualContributionLimit as number
                const years = contribByAccount.get(a.id)
                const used = years?.get(currentYear) ?? 0
                const remaining = limit - used
                const pct = Math.max(0, Math.min(1, used / limit))
                const full = used >= limit
                const fillClass = full
                  ? 'bg-destructive'
                  : pct >= 0.8
                    ? 'bg-amber-500'
                    : 'bg-primary'
                const priorYears = years
                  ? [...years.entries()]
                      .filter(([y, amt]) => y !== currentYear && amt > 0)
                      .sort((x, y) => (x[0] < y[0] ? 1 : -1))
                  : []
                return (
                  <div key={a.id} className="space-y-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{a.name}</span>
                        <Badge variant="secondary" className="shrink-0">
                          {t(kindLabelKey(a.kind))}
                        </Badge>
                      </div>
                      <span className="tabular-nums text-sm shrink-0">
                        {money(used)}{' '}
                        <span className="text-muted-foreground">
                          / {money(limit)}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${fillClass}`}
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      {full ? (
                        <span className="font-medium text-destructive">
                          {remaining < 0
                            ? t('accounts.contrib.over', {
                                amount: money(-remaining),
                              })
                            : t('accounts.contrib.full')}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {t('accounts.contrib.remaining')} :{' '}
                          <span className="tabular-nums text-foreground">
                            {money(remaining)}
                          </span>
                        </span>
                      )}
                      <span className="text-muted-foreground">
                        {t('accounts.contrib.thisYear', { year: currentYear })}
                      </span>
                    </div>
                    {priorYears.length > 0 && (
                      <div className="text-xs text-muted-foreground pt-0.5">
                        <span className="mr-2">
                          {t('accounts.contrib.priorYears')} :
                        </span>
                        {priorYears.map(([y, amt]) => (
                          <span key={y} className="mr-3 tabular-nums">
                            {y} {money(amt)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {locale === 'fr' ? 'Liste des comptes' : 'Account list'}
            </CardTitle>
            <CardDescription className="text-xs">
              {loading
                ? '…'
                : `${accounts.length} ${locale === 'fr' ? 'compte(s)' : 'account(s)'}`}
              {unassignedCount > 0 && (
                <>
                  {' · '}
                  <span className="text-muted-foreground">
                    {unassignedCount}{' '}
                    {locale === 'fr'
                      ? 'transaction(s) sans compte'
                      : 'unassigned transaction(s)'}
                  </span>
                </>
              )}
            </CardDescription>
          </CardHeader>
          <CardContent className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('accounts.fields.name')}</TableHead>
                  <TableHead>{t('accounts.fields.kind')}</TableHead>
                  <TableHead>
                    {t('accounts.fields.brokerNumber').replace(
                      / \(.*\)/,
                      '',
                    )}
                  </TableHead>
                  <TableHead>
                    {t('accounts.fields.defaultCurrency')}
                  </TableHead>
                  <TableHead className="text-right">
                    {locale === 'fr' ? 'Transactions' : 'Trades'}
                  </TableHead>
                  <TableHead className="text-right w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={6}>
                      <Skeleton className="h-5 w-full" />
                    </TableCell>
                  </TableRow>
                )}
                {!loading && accounts.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={6}
                      className="text-center text-sm text-muted-foreground py-10"
                    >
                      {t('accounts.empty')}
                    </TableCell>
                  </TableRow>
                )}
                {!loading &&
                  accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {t(kindLabelKey(a.kind))}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {a.brokerAccountNumber ?? '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {a.defaultCurrency ?? '—'}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {txCounts.get(a.id) ?? 0}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => openEdit(a)}
                            aria-label="edit"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="ghost"
                            onClick={() => handleDelete(a)}
                            aria-label="delete"
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('accounts.edit') : t('accounts.add')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-1.5">
              <Label htmlFor="acc-name">{t('accounts.fields.name')}</Label>
              <Input
                id="acc-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder={
                  locale === 'fr'
                    ? 'ex. CELI Questrade'
                    : 'e.g. Questrade TFSA'
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{t('accounts.fields.kind')}</Label>
                <Select
                  key={form.kind}
                  value={form.kind}
                  onValueChange={(v) => {
                    const kind = v as AccountKind
                    setForm((prev) => ({
                      ...prev,
                      kind,
                      // Prefill the standard FHSA cap when the user
                      // switches to FHSA and hasn't typed a limit yet.
                      annualLimit:
                        kind === 'fhsa' && prev.annualLimit.trim() === ''
                          ? String(FHSA_ANNUAL_LIMIT)
                          : prev.annualLimit,
                    }))
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_KINDS.map((k) => (
                      <SelectItem key={k} value={k}>
                        {t(kindLabelKey(k))}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label>{t('accounts.fields.defaultCurrency')}</Label>
                <Select
                  key={form.defaultCurrency || '_'}
                  value={form.defaultCurrency || '_'}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      defaultCurrency:
                        v === '_' ? '' : (v as Currency),
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_">—</SelectItem>
                    <SelectItem value="CAD">CAD</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="acc-broker">
                {t('accounts.fields.brokerNumber')}
              </Label>
              <Input
                id="acc-broker"
                value={form.brokerAccountNumber}
                onChange={(e) =>
                  setForm({ ...form, brokerAccountNumber: e.target.value })
                }
                placeholder="53543085"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="acc-limit">
                {t('accounts.fields.annualLimit')}
              </Label>
              <Input
                id="acc-limit"
                inputMode="decimal"
                value={form.annualLimit}
                onChange={(e) =>
                  setForm({ ...form, annualLimit: e.target.value })
                }
                placeholder="8000"
              />
              <p className="text-xs text-muted-foreground">
                {t('accounts.fields.annualLimitHint')}
              </p>
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
