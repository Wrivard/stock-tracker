import { useCallback, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Moon, RefreshCw, Sun } from 'lucide-react'

import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT, formatRelativeTime } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export function AppHeader() {
  const { t, locale } = useT()
  const displayCurrency = useUi((s) => s.displayCurrency)
  const setDisplayCurrency = useUi((s) => s.setDisplayCurrency)
  const setLocale = useUi((s) => s.setLocale)
  const apiKeyStatus = useUi((s) => s.apiKeyStatus)
  const lastRefreshAt = useUi((s) => s.lastRefreshAt)
  const bumpRefresh = useUi((s) => s.bumpRefresh)
  const { theme, setTheme } = useTheme()
  const [refreshing, setRefreshing] = useState(false)
  // next-themes resolves the theme client-side only, so the Sun/Moon icon
  // can't be rendered during SSR/SSG without a hydration mismatch. We delay
  // the icon until after mount.
  const [themeMounted, setThemeMounted] = useState(false)
  useEffect(() => setThemeMounted(true), [])

  const handleRefresh = useCallback(async () => {
    if (!apiKeyStatus.finnhub) {
      toast.error(
        locale === 'fr'
          ? 'Cle Finnhub manquante — va dans Parametres.'
          : 'Finnhub key missing — open Settings.',
      )
      return
    }
    setRefreshing(true)
    try {
      const result = await api().market.refreshAll()
      const errors = Object.entries(result).filter(([, v]) => v.quoteError).length
      if (errors > 0) {
        toast.warning(
          locale === 'fr'
            ? `${errors} erreur(s) sur les quotes`
            : `${errors} quote error(s)`,
        )
      } else {
        toast.success(
          locale === 'fr' ? 'Cotations actualisees' : 'Quotes refreshed',
        )
      }
      bumpRefresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshing(false)
    }
  }, [apiKeyStatus.finnhub, locale, bumpRefresh])

  return (
    <TooltipProvider>
      <header className="h-14 border-b border-border bg-background/80 backdrop-blur flex items-center justify-end gap-3 px-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs text-muted-foreground tabular-nums">
              {formatRelativeTime(lastRefreshAt, locale)}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            {locale === 'fr'
              ? 'Derniere actualisation des cotations'
              : 'Last quote refresh'}
          </TooltipContent>
        </Tooltip>

        {!apiKeyStatus.finnhub && (
          <Badge variant="destructive" className="text-xs">
            {locale === 'fr' ? 'Cles API manquantes' : 'API keys missing'}
          </Badge>
        )}

        <Select
          value={displayCurrency}
          onValueChange={(v) => setDisplayCurrency(v as 'USD' | 'CAD')}
        >
          <SelectTrigger className="h-9 w-[80px]" aria-label="display currency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CAD">CAD</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
          </SelectContent>
        </Select>

        <Select value={locale} onValueChange={(v) => setLocale(v as 'fr' | 'en')}>
          <SelectTrigger className="h-9 w-[70px]" aria-label="language">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="fr">FR</SelectItem>
            <SelectItem value="en">EN</SelectItem>
          </SelectContent>
        </Select>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="toggle theme"
              suppressHydrationWarning
            >
              {themeMounted ? (
                theme === 'dark' ? <Sun /> : <Moon />
              ) : (
                <span className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {locale === 'fr' ? 'Basculer le theme' : 'Toggle theme'}
          </TooltipContent>
        </Tooltip>

        <Button
          variant="default"
          size="sm"
          onClick={handleRefresh}
          disabled={refreshing}
        >
          <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
          {refreshing ? t('common.refreshing') : t('common.refresh')}
        </Button>
      </header>
    </TooltipProvider>
  )
}
