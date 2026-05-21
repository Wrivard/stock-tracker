import type { Sector } from '../../../main/db/types'
import type { EtfDetails } from '../../../main/services/types'
import { useT, formatRelativeTime } from '@/lib/i18n'
import { formatNumber } from '@/lib/format'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

interface EtfDetailsCardProps {
  details: EtfDetails
  sectors: Sector[]
  fetchedAt: number | null
  stale: boolean
}

export function EtfDetailsCard({
  details,
  sectors,
  fetchedAt,
  stale,
}: EtfDetailsCardProps) {
  const { locale } = useT()
  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'

  const sortedSectors = Object.entries(details.sectorWeightings)
    .map(([code, weight]) => ({
      code,
      weight,
      meta: sectors.find((s) => s.code === code),
    }))
    .sort((a, b) => b.weight - a.weight)

  const maxWeight = sortedSectors[0]?.weight ?? 0

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {locale === 'fr' ? 'Composition par secteur' : 'Sector composition'}
          </CardTitle>
          <CardDescription className="text-xs">
            {details.family && <>{details.family} · </>}
            {fetchedAt
              ? `${locale === 'fr' ? 'Donnees' : 'Data'} · ${formatRelativeTime(fetchedAt, locale)}${stale ? ` · ${locale === 'fr' ? 'perime' : 'stale'}` : ''}`
              : ''}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedSectors.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {locale === 'fr'
                ? 'Aucune ventilation par secteur disponible.'
                : 'No sector breakdown available.'}
            </p>
          ) : (
            <ul className="space-y-2.5">
              {sortedSectors.map(({ code, weight, meta }) => (
                <li key={code} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5">
                      <span
                        className="inline-block size-2 rounded-full"
                        style={{ backgroundColor: meta?.color ?? '#737373' }}
                      />
                      {meta
                        ? locale === 'fr'
                          ? meta.labelFr
                          : meta.labelEn
                        : code}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatNumber(weight * 100, lc, 2)}%
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${(weight / maxWeight) * 100}%`,
                        backgroundColor: meta?.color ?? '#737373',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {locale === 'fr' ? 'Principales positions' : 'Top holdings'}
          </CardTitle>
          <CardDescription className="text-xs">
            {details.holdings.length}{' '}
            {locale === 'fr' ? 'titres divulgues' : 'disclosed holdings'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {details.holdings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              {locale === 'fr'
                ? "Yahoo n'expose pas les titres de cet ETF."
                : 'Yahoo does not expose holdings for this ETF.'}
            </p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {details.holdings.map((h, idx) => (
                <li
                  key={`${h.symbol ?? h.name}-${idx}`}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {h.symbol && (
                      <span className="font-mono text-xs font-medium shrink-0">
                        {h.symbol}
                      </span>
                    )}
                    <span className="text-muted-foreground text-xs truncate">
                      {h.name}
                    </span>
                  </div>
                  <span className="tabular-nums font-medium text-xs">
                    {formatNumber(h.percent * 100, lc, 2)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
