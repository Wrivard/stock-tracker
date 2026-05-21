import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import type { Sector } from '../../../main/db/types'
import { api } from '@/lib/api'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SectorPickerProps {
  ticker: string | null
  currentSectorId: number | null
  onClose: () => void
  onChanged: () => void
}

export function SectorPicker({
  ticker,
  currentSectorId,
  onClose,
  onChanged,
}: SectorPickerProps) {
  const { t, locale } = useT()
  const [sectors, setSectors] = useState<Sector[]>([])
  const [selected, setSelected] = useState<string>(
    currentSectorId === null ? '' : String(currentSectorId),
  )
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!ticker) return
    setSelected(currentSectorId === null ? '' : String(currentSectorId))
    api()
      .sectors.list()
      .then(setSectors)
      .catch((err: Error) => toast.error(err.message))
  }, [ticker, currentSectorId])

  async function handleSave() {
    if (!ticker) return
    setSaving(true)
    try {
      const sectorId = selected === '' ? null : Number(selected)
      await api().tickers.setSector(ticker, sectorId, true)
      toast.success(
        locale === 'fr' ? 'Secteur mis a jour' : 'Sector updated',
      )
      onChanged()
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!ticker} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>
            {locale === 'fr' ? 'Changer de secteur' : 'Change sector'} — {ticker}
          </DialogTitle>
          <DialogDescription>
            {locale === 'fr'
              ? "L'override desactive la detection auto par Finnhub pour ce ticker."
              : 'Override disables Finnhub auto-detection for this ticker.'}
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue
                placeholder={
                  locale === 'fr' ? 'Selectionne un secteur' : 'Pick a sector'
                }
              />
            </SelectTrigger>
            <SelectContent>
              {sectors.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {locale === 'fr' ? s.labelFr : s.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleSave} disabled={saving || selected === ''}>
            {saving ? t('common.refreshing') : t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
