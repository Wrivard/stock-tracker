import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import type {
  Currency,
  Transaction,
  TransactionInput,
  TransactionKind,
} from '../../../main/db/types'
import type { SymbolSearchResult } from '../../../main/services/types'
import { api } from '@/lib/api'
import { todayIsoDate } from '@/lib/format'
import { useT } from '@/lib/i18n'
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
import { TickerCombobox } from './TickerCombobox'

interface FormState {
  ticker: string
  kind: TransactionKind
  quantity: string
  price: string
  currency: Currency
  fees: string
  occurredAt: string
  notes: string
}

function defaultsFor(existing?: Transaction | null, defaultTicker?: string): FormState {
  if (existing) {
    return {
      ticker: existing.ticker,
      kind: existing.kind,
      quantity: String(existing.quantity),
      price: String(existing.price),
      currency: existing.currency,
      fees: String(existing.fees),
      occurredAt: existing.occurredAt,
      notes: existing.notes ?? '',
    }
  }
  return {
    ticker: defaultTicker ?? '',
    kind: 'buy',
    quantity: '',
    price: '',
    currency: 'CAD',
    fees: '0',
    occurredAt: todayIsoDate(),
    notes: '',
  }
}

interface TransactionFormProps {
  open: boolean
  onClose: () => void
  // Pass an existing transaction to edit. Omit to add new.
  editing?: Transaction | null
  // Pre-fill the ticker (only used when editing is null).
  defaultTicker?: string
  onSubmit: (input: TransactionInput) => Promise<void>
}

export function TransactionForm({
  open,
  onClose,
  editing,
  defaultTicker,
  onSubmit,
}: TransactionFormProps) {
  const { t } = useT()
  const [form, setForm] = useState<FormState>(() => defaultsFor(editing, defaultTicker))
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [autoFilling, setAutoFilling] = useState(false)

  // Reset form whenever the dialog opens or the target transaction changes.
  if (open && form.ticker === '' && editing) {
    // First render after `editing` set — bring values in.
    setForm(defaultsFor(editing, defaultTicker))
  }

  // When the user picks a real result from the combobox, fetch its profile
  // to auto-fill the currency. Network calls go through the cache so a
  // recently-picked ticker resolves instantly.
  async function handleTickerPick(picked: SymbolSearchResult) {
    setForm((s) => ({ ...s, ticker: picked.displaySymbol.toUpperCase() }))
    setAutoFilling(true)
    try {
      const { data } = await api().market.profile(picked.displaySymbol)
      const cur =
        data.currency === 'CAD' ? 'CAD' : data.currency === 'USD' ? 'USD' : null
      if (cur) {
        setForm((s) => ({ ...s, currency: cur }))
      }
    } catch (err) {
      // Non-fatal: keep whatever currency was set, just notify.
      toast.warning(
        err instanceof Error
          ? `Profil indisponible (${err.message})`
          : 'Profil indisponible',
      )
    } finally {
      setAutoFilling(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    const qty = Number(form.quantity)
    const price = Number(form.price)
    if (!form.ticker.trim() || !Number.isFinite(qty) || qty <= 0) {
      setError('Ticker requis, quantite > 0.')
      return
    }
    if (!Number.isFinite(price) || price < 0) {
      setError('Prix doit etre un nombre >= 0.')
      return
    }
    const input: TransactionInput = {
      ticker: form.ticker.trim().toUpperCase(),
      kind: form.kind,
      quantity: qty,
      price,
      currency: form.currency,
      fees: form.fees ? Number(form.fees) : 0,
      notes: form.notes || null,
      occurredAt: form.occurredAt,
    }
    setSubmitting(true)
    try {
      await onSubmit(input)
      setForm(defaultsFor(null))
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  function handleClose(open: boolean) {
    if (!open) {
      setForm(defaultsFor(null))
      setError(null)
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{editing ? t('tx.edit') : t('tx.new')}</DialogTitle>
            <DialogDescription>
              {editing
                ? `ID #${editing.id}`
                : t('common.cancel') /* placeholder; description below shows real text */}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="tx-ticker">
                  {t('tx.fields.ticker')}
                  {autoFilling && (
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      …
                    </span>
                  )}
                </Label>
                <TickerCombobox
                  value={form.ticker}
                  onChange={(v) => setForm((s) => ({ ...s, ticker: v }))}
                  onPick={handleTickerPick}
                  disabled={!!editing}
                  autoFocus={!editing}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="tx-kind">{t('tx.fields.kind')}</Label>
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
                    <SelectItem value="buy">{t('tx.fields.buy')}</SelectItem>
                    <SelectItem value="sell">{t('tx.fields.sell')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="tx-qty">{t('tx.fields.quantity')}</Label>
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
                <Label htmlFor="tx-price">{t('tx.fields.price')}</Label>
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
                <Label htmlFor="tx-currency">{t('tx.fields.currency')}</Label>
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
                <Label htmlFor="tx-fees">{t('tx.fields.fees')}</Label>
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
              <Label htmlFor="tx-date">{t('tx.fields.date')}</Label>
              <Input
                id="tx-date"
                type="date"
                value={form.occurredAt}
                onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="tx-notes">{t('tx.fields.notes')}</Label>
              <Input
                id="tx-notes"
                placeholder="…"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>

            {error && (
              <div className="text-sm text-destructive">{error}</div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => handleClose(false)}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? t('common.refreshing') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
