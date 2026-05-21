import Head from 'next/head'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ExternalLink, Newspaper, RefreshCw, Sparkles } from 'lucide-react'

import type { NewsRecapResult } from '../../main/services/ai/recap'
import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT } from '@/lib/i18n'
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

interface NewsItemView {
  id: string
  symbol: string
  headline: string
  summary: string
  source: string
  url: string
  publishedAt: number
  imageUrl: string | null
  tickerName: string | null
}

const ALL = '__all__'

export default function NewsPage() {
  const { t, locale } = useT()
  const refreshTick = useUi((s) => s.refreshTick)
  const dataTick = useUi((s) => s.dataTick)
  const initialized = useUi((s) => s.initialized)
  const apiKeyStatus = useUi((s) => s.apiKeyStatus)
  const bumpRefresh = useUi((s) => s.bumpRefresh)

  const [items, setItems] = useState<NewsItemView[]>([])
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>(ALL)
  const [recapBusy, setRecapBusy] = useState(false)
  const [recap, setRecap] = useState<NewsRecapResult | null>(null)
  const [recapOpen, setRecapOpen] = useState(false)
  const [refreshingFromRecap, setRefreshingFromRecap] = useState(false)

  const reload = async () => {
    setLoading(true)
    try {
      // Pass cachedOnly: false so the renderer triggers a live Yahoo fetch
      // when the news cache is empty (typical on first launch). withCache
      // still honors its 30 min TTL so this doesn't spam — repeat loads
      // within the window serve from SQLite.
      const data = await api().market.portfolioNews({ cachedOnly: false })
      setItems(data.items)
      setErrors(data.errors)
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
  }, [initialized, refreshTick, dataTick])

  const tickers = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) set.add(item.symbol)
    return Array.from(set).sort()
  }, [items])

  const filtered = useMemo(() => {
    if (filter === ALL) return items
    return items.filter((i) => i.symbol === filter)
  }, [items, filter])

  async function openLink(url: string) {
    try {
      await api().shell.openExternal(url)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleRecap() {
    if (!apiKeyStatus.openai) {
      toast.error(t('news.recapNoKey'))
      return
    }
    setRecapBusy(true)
    try {
      const result = await api().ai.newsRecap(locale, 7)
      setRecap(result)
      setRecapOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setRecapBusy(false)
    }
  }

  // Refresh inside the empty-state Recap dialog. Same code path as the
  // header button: warm quotes + news, bump tickers so all pages reload,
  // then retry the recap. Closes the dialog if news appear so the user
  // sees the populated state instead of the empty one.
  async function handleRefreshFromRecap() {
    setRefreshingFromRecap(true)
    try {
      await api().market.refreshAll()
      bumpRefresh()
      await reload()
      // Retry the recap automatically with the freshly populated cache.
      const result = await api().ai.newsRecap(locale, 7)
      setRecap(result)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setRefreshingFromRecap(false)
    }
  }

  const lc = locale === 'fr' ? 'fr-CA' : 'en-CA'

  return (
    <>
      <Head>
        <title>{`${t('news.title')} · Beta Trading Hub`}</title>
      </Head>
      <div className="p-6 max-w-5xl mx-auto space-y-5">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              {t('news.title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {locale === 'fr'
                ? 'Articles recents (Yahoo + Finnhub) pour les tickers du portefeuille.'
                : 'Recent articles (Yahoo + Finnhub) for your portfolio tickers.'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {filter === ALL && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleRecap}
                disabled={recapBusy || !apiKeyStatus.openai}
                title={!apiKeyStatus.openai ? t('news.recapNoKey') : undefined}
              >
                <Sparkles className="size-3.5" />
                {recapBusy ? t('news.recapBusy') : t('news.recapButton')}
              </Button>
            )}
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px] h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>{t('news.allTickers')}</SelectItem>
                {tickers.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </header>

        {Object.entries(errors).length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-muted-foreground">
            <span className="font-medium text-amber-500">
              {locale === 'fr' ? 'Avertissements : ' : 'Warnings: '}
            </span>
            {Object.entries(errors)
              .map(([sym, msg]) => `${sym} (${msg})`)
              .join(' · ')}
          </div>
        )}

        {loading && filtered.length === 0 && (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-lg" />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Newspaper className="size-4" />
                {t('news.empty')}
              </CardTitle>
              <CardDescription className="text-xs">
                {locale === 'fr'
                  ? 'Clique sur Actualiser dans le header pour fetcher les news des tickers.'
                  : 'Click Refresh in the header to fetch news for your tickers.'}
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        <div className="space-y-2">
          {filtered.map((n) => (
            <article
              key={n.id}
              className="group rounded-lg border border-border bg-card hover:border-primary/40 transition-colors cursor-pointer"
              onClick={() => openLink(n.url)}
            >
              <div className="flex gap-4 p-4">
                {n.imageUrl && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={n.imageUrl}
                    alt=""
                    className="w-24 h-20 object-cover rounded-md flex-shrink-0 bg-muted"
                    loading="lazy"
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                    <Link
                      href={{ pathname: '/ticker', query: { symbol: n.symbol } }}
                      onClick={(e) => e.stopPropagation()}
                      className="font-mono font-medium text-foreground hover:text-primary transition-colors"
                    >
                      {n.symbol}
                    </Link>
                    <span>·</span>
                    <span>{n.source}</span>
                    <span>·</span>
                    <span>{new Date(n.publishedAt).toLocaleString(lc)}</span>
                  </div>
                  <h3 className="font-medium leading-snug group-hover:text-primary transition-colors">
                    {n.headline}
                  </h3>
                  {n.summary && (
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {n.summary}
                    </p>
                  )}
                  <Button
                    variant="link"
                    size="sm"
                    className="px-0 h-auto text-xs gap-1"
                    onClick={(e) => {
                      e.stopPropagation()
                      openLink(n.url)
                    }}
                  >
                    {locale === 'fr' ? "Lire l'article" : 'Read article'}
                    <ExternalLink className="size-3" />
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>

      <Dialog open={recapOpen} onOpenChange={setRecapOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {t('news.recapTitle')}
            </DialogTitle>
            {recap && recap.articleCount > 0 && (
              <DialogDescription>
                {t('news.recapMeta', {
                  articles: recap.articleCount,
                  tickers: recap.tickerCount,
                  model: recap.model,
                })}
              </DialogDescription>
            )}
          </DialogHeader>
          {recap && recap.articleCount === 0 && (
            // Empty state. recap.ts already short-circuits without an
            // OpenAI call when there's nothing to summarize, so we never
            // burned credits to land here. Offer a one-click refresh so
            // the user can populate the cache and retry without closing
            // the dialog.
            <div className="flex flex-col items-center text-center gap-3 py-6">
              <div className="size-12 rounded-full bg-muted flex items-center justify-center">
                <Newspaper className="size-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">
                {t('news.recapEmptyTitle')}
              </p>
              <p className="text-xs text-muted-foreground max-w-sm">
                {t('news.recapEmptyBody')}
              </p>
              <Button
                size="sm"
                onClick={handleRefreshFromRecap}
                disabled={refreshingFromRecap}
              >
                <RefreshCw
                  className={refreshingFromRecap ? 'animate-spin' : ''}
                />
                {refreshingFromRecap
                  ? t('common.refreshing')
                  : t('common.refresh')}
              </Button>
              <p className="text-[11px] text-muted-foreground/80 max-w-sm pt-2 border-t border-border/40 mt-2">
                {t('news.recapEtfHint')}
              </p>
            </div>
          )}
          {recap && recap.articleCount > 0 && (
            <div className="space-y-3 text-sm leading-relaxed">
              {recap.content.split(/\n(?=## )/g).map((block, i) => {
                const headingMatch = block.match(/^## (.+)\n?/)
                if (headingMatch) {
                  const heading = headingMatch[1].trim()
                  const body = block.slice(headingMatch[0].length).trim()
                  return (
                    <section key={i} className="space-y-1">
                      <h3 className="font-mono text-xs uppercase tracking-wider text-primary">
                        {heading}
                      </h3>
                      <p className="text-muted-foreground whitespace-pre-wrap">
                        {body}
                      </p>
                    </section>
                  )
                }
                return (
                  <p key={i} className="text-muted-foreground whitespace-pre-wrap">
                    {block.trim()}
                  </p>
                )
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
