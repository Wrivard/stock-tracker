import { useCallback, useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import { Moon, Plus, RefreshCw, Sun } from 'lucide-react'

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
  const openQuickTrade = useUi((s) => s.openQuickTrade)
  const { theme, setTheme } = useTheme()
  const [refreshing, setRefreshing] = useState(false)
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
      const failing = Object.entries(result)
        .filter(([, v]) => v.quoteError)
        .map(([sym]) => sym)
      if (failing.length > 0) {
        // Include the failing tickers in the toast so the user can act
        // on it instead of just seeing a count.
        const list =
          failing.length <= 3
            ? failing.join(', ')
            : `${failing.slice(0, 3).join(', ')} +${failing.length - 3}`
        toast.warning(
          locale === 'fr'
            ? `Echec quote: ${list}`
            : `Failed quotes: ${list}`,
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
    <TooltipProvider delayDuration={250}>
      <header className="h-12 border-b border-border bg-background flex items-center justify-end gap-2 px-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="sm"
              onClick={() => openQuickTrade()}
              className="gap-1.5 font-medium"
            >
              <Plus className="size-3.5" />
              {locale === 'fr' ? 'Nouvelle transaction' : 'New trade'}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <span className="text-[11px]">
              {locale === 'fr' ? 'Raccourci' : 'Shortcut'}
              <kbd className="ml-2 px-1 py-px rounded bg-muted text-[10px] font-mono">
                Ctrl + N
              </kbd>
            </span>
          </TooltipContent>
        </Tooltip>

        <div className="mx-1 h-5 w-px bg-border" />

        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[11px] text-muted-foreground tabular-nums px-2">
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
          <Badge variant="destructive" className="text-[10px]">
            {locale === 'fr' ? 'Cles manquantes' : 'Keys missing'}
          </Badge>
        )}

        <Select
          // key={displayCurrency} forces React to unmount/remount the
          // Select whenever the store's currency changes. Belt-and-
          // suspenders fix for an issue where clicking CAD left the
          // trigger stuck on USD — likely a controlled-value desync
          // between Radix's internal state and the Zustand prop. With
          // the key swap there's no state to be stale; the new mount
          // reads the fresh `value`.
          key={displayCurrency}
          value={displayCurrency}
          onValueChange={(v) => {
            if (v === 'USD' || v === 'CAD') setDisplayCurrency(v)
          }}
        >
          <SelectTrigger
            className="h-8 w-[68px] text-xs"
            aria-label="display currency"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="CAD">CAD</SelectItem>
            <SelectItem value="USD">USD</SelectItem>
          </SelectContent>
        </Select>

        <Select
          key={locale}
          value={locale}
          onValueChange={(v) => {
            if (v === 'fr' || v === 'en') setLocale(v)
          }}
        >
          <SelectTrigger
            className="h-8 w-[60px] text-xs"
            aria-label="language"
          >
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
                theme === 'dark' ? (
                  <Sun />
                ) : (
                  <Moon />
                )
              ) : (
                <span className="size-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {locale === 'fr' ? 'Basculer le theme' : 'Toggle theme'}
          </TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleRefresh}
              disabled={refreshing}
              aria-label={t('common.refresh')}
            >
              <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{t('common.refresh')}</TooltipContent>
        </Tooltip>
      </header>
    </TooltipProvider>
  )
}
