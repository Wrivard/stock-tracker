import { useCallback, useEffect, useRef, useState } from 'react'
import { useTheme } from 'next-themes'
import { toast } from 'sonner'
import {
  Check,
  ChevronDown,
  Moon,
  Plus,
  RefreshCw,
  Sun,
  UserCircle2,
} from 'lucide-react'

import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT, formatRelativeTime } from '@/lib/i18n'
import { cn } from '@/lib/utils'
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
      {/* flex-wrap so the header gracefully degrades on narrow Electron
          windows. h-auto + min-h replaces the fixed h-12 because wrapped
          rows need vertical room; the min-h keeps the unwrapped (common)
          case visually unchanged. */}
      <header className="min-h-12 border-b border-border bg-background flex flex-wrap items-center justify-end gap-2 px-4 py-1.5">
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
            <span className="text-[11px] text-muted-foreground tabular-nums px-2 truncate max-w-[120px]">
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

        <ProfilePicker locale={locale} />

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

// Header-level profile picker. Lives next to the currency Select.
// Closing-action item at the bottom of the dropdown opens a small
// "create new" dialog. Hidden in the < 2 profiles case ONLY if the
// "Create" affordance would otherwise be the only visible item —
// we still want the picker visible to surface the feature.
function ProfilePicker({ locale }: { locale: 'fr' | 'en' }) {
  const initialized = useUi((s) => s.initialized)
  const dataTick = useUi((s) => s.dataTick)
  const activeProfileId = useUi((s) => s.activeProfileId)
  const setActiveProfileId = useUi((s) => s.setActiveProfileId)
  const bumpData = useUi((s) => s.bumpData)
  const [profiles, setProfiles] = useState<
    Array<{ id: number; name: string }>
  >([])
  const [createOpen, setCreateOpen] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    if (!initialized) return
    let cancelled = false
    api()
      .profiles.list()
      .then((p) => {
        if (cancelled) return
        setProfiles(p)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [initialized, dataTick])

  const active = profiles.find((p) => p.id === activeProfileId)
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement | null>(null)

  // Click-outside + Escape to close. Without Radix's portalled
  // dropdown we wire these ourselves.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      if (!wrapperRef.current) return
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeydown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeydown)
    }
  }, [open])

  async function handleCreate() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      const created = await api().profiles.create({ name })
      // Refresh local list + switch to the new profile immediately so
      // the user lands on an empty dashboard ready to import.
      const next = await api().profiles.list()
      setProfiles(next)
      await setActiveProfileId(created.id)
      bumpData()
      setNewName('')
      setCreateOpen(false)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <>
      {/* Custom dropdown — bypasses Radix Select entirely. Two
          previous Select-based attempts had the dropdown failing to
          respond after the first click (controlled-value desync vs.
          Radix internal selection state). A plain button + an
          absolutely-positioned div is dumb but it works deterministic-
          ally. The Plus button next to it opens the create dialog. */}
      <div ref={wrapperRef} className="relative">
        <Button
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="h-8 max-w-[180px] text-xs gap-1.5 font-normal"
          aria-label="profile"
          aria-expanded={open}
          aria-haspopup="menu"
        >
          <UserCircle2 className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {active?.name ?? (locale === 'fr' ? 'Profil' : 'Profile')}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1 min-w-[180px] rounded-md border border-border bg-popover shadow-md z-50 py-1 max-h-64 overflow-y-auto"
          >
            {profiles.length === 0 && (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">
                …
              </div>
            )}
            {profiles.map((p) => (
              <button
                key={p.id}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false)
                  if (p.id !== activeProfileId) {
                    void setActiveProfileId(p.id)
                  }
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-2 py-1.5 text-xs text-left hover:bg-accent hover:text-accent-foreground transition-colors',
                  p.id === activeProfileId && 'font-medium',
                )}
              >
                <Check
                  className={cn(
                    'size-3.5 shrink-0',
                    p.id === activeProfileId
                      ? 'text-primary'
                      : 'opacity-0',
                  )}
                />
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setCreateOpen(true)}
            aria-label="new profile"
          >
            <Plus />
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          {locale === 'fr' ? 'Nouveau profil' : 'New profile'}
        </TooltipContent>
      </Tooltip>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {locale === 'fr' ? 'Nouveau profil' : 'New profile'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="profile-name">
              {locale === 'fr' ? 'Nom du profil' : 'Profile name'}
            </Label>
            <Input
              id="profile-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={
                locale === 'fr'
                  ? 'ex. Placements de ma copine'
                  : "e.g. My partner's portfolio"
              }
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleCreate()
              }}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              disabled={creating}
            >
              {locale === 'fr' ? 'Annuler' : 'Cancel'}
            </Button>
            <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
              {creating ? '…' : locale === 'fr' ? 'Creer' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
