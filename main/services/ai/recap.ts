import { listTickers } from '../../db/repo/tickers'
import { readRaw } from '../cache'
import type { NewsItem } from '../types'
import { chatCompletion, type OpenAiCallResult } from './openai'

export interface NewsRecapResult {
  content: string
  articleCount: number
  tickerCount: number
  windowDays: number
  generatedAt: number
  model: string
  usage: OpenAiCallResult['usage']
}

// Pulls cached news for every owned ticker, keeps the past WINDOW_DAYS,
// builds a tight prompt and asks gpt-4o-mini for a concise recap. We
// only read from cache (no live fetches) so the user sees a snappy
// response based on whatever Yahoo/Finnhub last returned. If the cache
// is empty the user should hit Refresh first.
export async function summarizePortfolioWeek(
  locale: 'fr' | 'en' = 'fr',
  windowDays = 7,
): Promise<NewsRecapResult> {
  const tickers = listTickers()
  const cutoff = Date.now() - windowDays * 86_400_000
  const articles: Array<{ ticker: string; date: string; source: string; headline: string }> = []
  const seenTickers = new Set<string>()

  for (const t of tickers) {
    const cached = readRaw<NewsItem[]>(`news:${t.symbol}`)
    if (!cached?.data) continue
    let hasAny = false
    for (const n of cached.data) {
      if (n.publishedAt < cutoff) continue
      articles.push({
        ticker: t.symbol,
        date: new Date(n.publishedAt).toISOString().slice(0, 10),
        source: n.source,
        headline: n.headline,
      })
      hasAny = true
    }
    if (hasAny) seenTickers.add(t.symbol)
  }

  // Group + format compactly. Markdown is fine — the model can read it
  // and the renderer can pretty-print the response.
  const byTicker = new Map<string, Array<(typeof articles)[number]>>()
  for (const a of articles) {
    if (!byTicker.has(a.ticker)) byTicker.set(a.ticker, [])
    byTicker.get(a.ticker)!.push(a)
  }
  const formatted = Array.from(byTicker.entries())
    .map(([sym, items]) => {
      const lines = items
        .sort((a, b) => a.date.localeCompare(b.date))
        .map((a) => `- ${a.date} (${a.source}): ${a.headline}`)
        .join('\n')
      return `## ${sym}\n${lines}`
    })
    .join('\n\n')

  if (articles.length === 0) {
    const empty =
      locale === 'fr'
        ? 'Aucune actualite en cache pour la fenetre selectionnee. Clique sur Actualiser dans le header pour charger les news, puis reessaie.'
        : 'No cached news in the selected window. Click Refresh in the header to load news, then try again.'
    return {
      content: empty,
      articleCount: 0,
      tickerCount: 0,
      windowDays,
      generatedAt: Date.now(),
      model: 'none',
      usage: null,
    }
  }

  const system =
    locale === 'fr'
      ? "Tu es un analyste financier concis. Tu produis des recaps clairs et neutres, sans speculation. Tu reponds en francais."
      : 'You are a concise financial analyst. Produce clear, neutral recaps without speculation. Respond in English.'

  const userPrompt =
    locale === 'fr'
      ? `Voici les actualites des ${windowDays} derniers jours pour les ${seenTickers.size} tickers du portefeuille. Pour chaque ticker, fais un recap de 2-3 lignes des developpements les plus pertinents pour le cours (resultats, deals, downgrades, news macro impactant le secteur). Utilise du markdown avec un ## par ticker. Si un ticker n'a pas de news significative, ecris simplement "Rien de notable cette semaine." sous son entete. Limite la reponse a environ 400 mots.\n\n${formatted}`
      : `Below are the past ${windowDays} days of news headlines for the ${seenTickers.size} tickers in the portfolio. For each ticker, write a 2-3 line recap of the most price-relevant developments (earnings, deals, downgrades, sector macro). Use markdown with a ## heading per ticker. If a ticker has no notable news, just write "Nothing notable this week." under its heading. Keep the response under ~400 words.\n\n${formatted}`

  const model = 'gpt-4o-mini'
  const result = await chatCompletion(
    [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    { model, temperature: 0.3, maxTokens: 900, timeoutMs: 90_000 },
  )

  return {
    content: result.content,
    articleCount: articles.length,
    tickerCount: seenTickers.size,
    windowDays,
    generatedAt: Date.now(),
    model,
    usage: result.usage,
  }
}
