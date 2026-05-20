import Head from 'next/head'
import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'

import type {
  Currency,
  Holding,
  Transaction,
  TransactionInput,
  TransactionKind,
} from '../../main/db/types'
import { api, useApiResource } from '@/lib/api'
import { formatMoney, formatNumber, todayIsoDate } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

interface TxFormState {
  ticker: string
  kind: TransactionKind
  quantity: string
  price: string
  currency: Currency
  fees: string
  occurredAt: string
  notes: string
}

const emptyForm = (): TxFormState => ({
  ticker: '',
  kind: 'buy',
  quantity: '',
  price: '',
  currency: 'CAD',
  fees: '0',
  occurredAt: todayIsoDate(),
  notes: '',
})

export default function HoldingsPage() {
  const {
    data: holdings,
    loading,
    error,
    refetch,
  } = useApiResource<Holding[]>(() => api().holdings.list(true), [])

  const [txDialogOpen, setTxDialogOpen] = useState(false)
  const [form, setForm] = useState<TxFormState>(emptyForm)
  const [submitting, setSubmitting] = useState(false)

  const [detailTicker, setDetailTicker] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const input: TransactionInput = {
        ticker: form.ticker.trim().toUpperCase(),
        kind: form.kind,
        quantity: Number(form.quantity),
        price: Number(form.price),
        currency: form.currency,
        fees: form.fees ? Number(form.fees) : 0,
        occurredAt: form.occurredAt,
        notes: form.notes || null,
      }
      if (!input.ticker || !Number.isFinite(input.quantity) || input.quantity <= 0) {
        throw new Error('Ticker et quantite sont requis (quantite > 0)')
      }
      if (!Number.isFinite(input.price) || input.price < 0) {
        throw new Error('Prix doit etre un nombre >= 0')
      }
      await api().transactions.create(input)
      toast.success(`Transaction ${input.kind} ajoutee pour ${input.ticker}`)
      setForm(emptyForm())
      setTxDialogOpen(false)
      await refetch()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toast.error(`Erreur : ${msg}`)
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeleteTicker(symbol: string) {
    if (
      !confirm(
        `Supprimer ${symbol} et toutes ses transactions ? Cette action est irreversible.`,
      )
    ) {
      return
    }
    try {
      await api().tickers.delete(symbol)
      toast.success(`${symbol} supprime`)
      await refetch()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <>
      <Head>
        <title>Holdings · Portfolio Tracker</title>
      </Head>
      <div className="p-6 space-y-6 max-w-6xl mx-auto">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Holdings</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Positions courantes, calculees a partir des transactions stockees
              localement.
            </p>
          </div>
          <Button onClick={() => setTxDialogOpen(true)}>
            <Plus />
            Ajouter une transaction
          </Button>
        </header>

        {error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 text-destructive p-4 text-sm">
            <strong>Erreur :</strong> {error.message}
          </div>
        )}

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Ticker</TableHead>
                <TableHead>Nom</TableHead>
                <TableHead>Secteur</TableHead>
                <TableHead className="text-right">Quantite</TableHead>
                <TableHead className="text-right">Cout moyen</TableHead>
                <TableHead className="text-right">Cout total</TableHead>
                <TableHead>Devise</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    Chargement…
                  </TableCell>
                </TableRow>
              )}
              {!loading && holdings && holdings.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="text-center text-sm text-muted-foreground py-8"
                  >
                    Aucun ticker. Clique sur « Ajouter une transaction » pour
                    commencer.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                holdings &&
                holdings.map((h) => (
                  <TableRow key={h.ticker}>
                    <TableCell className="font-mono font-medium">
                      <button
                        type="button"
                        className="hover:underline text-left"
                        onClick={() => setDetailTicker(h.ticker)}
                      >
                        {h.ticker}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {h.name ?? '—'}
                    </TableCell>
                    <TableCell>
                      {h.sectorCode ? (
                        <Badge variant="secondary">{h.sectorLabelFr}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-xs">
                          non assigne
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(h.quantity, 'fr-CA', 4)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(h.avgCost, h.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(h.totalCost, h.currency)}
                    </TableCell>
                    <TableCell>{h.currency}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDeleteTicker(h.ticker)}
                        aria-label={`Supprimer ${h.ticker}`}
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

      <Dialog open={txDialogOpen} onOpenChange={setTxDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <form onSubmit={handleSubmit}>
            <DialogHeader>
              <DialogTitle>Nouvelle transaction</DialogTitle>
              <DialogDescription>
                Achat ou vente. Le ticker est cree automatiquement si inconnu.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="tx-ticker">Ticker</Label>
                  <Input
                    id="tx-ticker"
                    placeholder="AAPL, SHOP.TO"
                    value={form.ticker}
                    onChange={(e) =>
                      setForm({ ...form, ticker: e.target.value.toUpperCase() })
                    }
                    autoFocus
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tx-kind">Type</Label>
                  <Select
                    value={form.kind}
                    onValueChange={(v) =>
                      setForm({ ...form, kind: v as TransactionKind })
                    }
                  >
                    <SelectTrigger id="tx-kind">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="buy">Achat</SelectItem>
                      <SelectItem value="sell">Vente</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="tx-qty">Quantite</Label>
                  <Input
                    id="tx-qty"
                    type="number"
                    step="any"
                    min="0"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tx-price">Prix unitaire</Label>
                  <Input
                    id="tx-price"
                    type="number"
                    step="any"
                    min="0"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-1.5">
                  <Label htmlFor="tx-currency">Devise</Label>
                  <Select
                    value={form.currency}
                    onValueChange={(v) =>
                      setForm({ ...form, currency: v as Currency })
                    }
                  >
                    <SelectTrigger id="tx-currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CAD">CAD</SelectItem>
                      <SelectItem value="USD">USD</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-1.5">
                  <Label htmlFor="tx-fees">Frais</Label>
                  <Input
                    id="tx-fees"
                    type="number"
                    step="any"
                    min="0"
                    value={form.fees}
                    onChange={(e) => setForm({ ...form, fees: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="tx-date">Date</Label>
                <Input
                  id="tx-date"
                  type="date"
                  value={form.occurredAt}
                  onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                  required
                />
              </div>

              <div className="grid gap-1.5">
                <Label htmlFor="tx-notes">Notes (optionnel)</Label>
                <Input
                  id="tx-notes"
                  placeholder="…"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setTxDialogOpen(false)}
                disabled={submitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <TransactionsDialog
        ticker={detailTicker}
        onClose={() => setDetailTicker(null)}
        onChanged={refetch}
      />
    </>
  )
}

interface TransactionsDialogProps {
  ticker: string | null
  onClose: () => void
  onChanged: () => Promise<void> | void
}

function TransactionsDialog({ ticker, onClose, onChanged }: TransactionsDialogProps) {
  const { data: txs, loading, refetch } = useApiResource<Transaction[]>(
    () => (ticker ? api().transactions.list({ ticker }) : Promise.resolve([])),
    [ticker],
  )

  async function handleDelete(id: number) {
    if (!confirm('Supprimer cette transaction ?')) return
    try {
      await api().transactions.delete(id)
      toast.success('Transaction supprimee')
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
          <DialogTitle>Transactions — {ticker}</DialogTitle>
          <DialogDescription>
            Historique des achats / ventes pour ce ticker.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-md border max-h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qte</TableHead>
                <TableHead className="text-right">Prix</TableHead>
                <TableHead className="text-right">Frais</TableHead>
                <TableHead>Devise</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-4">
                    Chargement…
                  </TableCell>
                </TableRow>
              )}
              {!loading && txs && txs.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                    Aucune transaction.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                txs &&
                txs.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="tabular-nums">{t.occurredAt}</TableCell>
                    <TableCell>
                      <Badge variant={t.kind === 'buy' ? 'default' : 'secondary'}>
                        {t.kind === 'buy' ? 'Achat' : 'Vente'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatNumber(t.quantity, 'fr-CA', 4)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(t.price, t.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(t.fees, t.currency)}
                    </TableCell>
                    <TableCell>{t.currency}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => handleDelete(t.id)}
                        aria-label="Supprimer"
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
