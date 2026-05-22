import { listAccounts } from '../../db/repo/accounts'
import { listDividends } from '../../db/repo/dividends'
import { listSectors } from '../../db/repo/sectors'
import { listTransactions } from '../../db/repo/transactions'
import { getPortfolioOverview } from '../portfolio'
import { computePortfolioTimeSeries } from '../timeseries'
import { chatCompletion, type OpenAiCallResult } from './openai'

export interface ChatMessageInput {
  role: 'user' | 'assistant'
  content: string
}

export interface PortfolioChatResult {
  content: string
  model: string
  usage: OpenAiCallResult['usage']
  // Echo the snapshot we computed for the prompt context so the
  // renderer can render "Context used" debug info if it wants.
  contextSnapshot: {
    totalValue: number
    displayCurrency: string
    positionCount: number
    accountCount: number
    dividendCount: number
  }
}

// Build a compact natural-language snapshot of the user's portfolio
// to feed the LLM as system context. Targets ~1-2K input tokens
// regardless of portfolio size — capped per section to keep the
// prompt small. The output deliberately reads like notes for a
// human analyst (numbered positions, recent trades summarized) so
// gpt-4o-mini can answer follow-up questions without us having to
// re-prompt with raw data on every turn.
function buildPortfolioContext(): { text: string; snapshot: PortfolioChatResult['contextSnapshot'] } {
  const overview = getPortfolioOverview()
  const accounts = listAccounts()
  const txs = listTransactions()
  const dividends = listDividends()
  const sectors = listSectors()

  const lines: string[] = []
  lines.push('=== PORTFOLIO SNAPSHOT ===')
  lines.push(
    `Display currency: ${overview.displayCurrency}`,
  )
  lines.push(
    `Total value: ${overview.totalValue.toFixed(2)} ${overview.displayCurrency}`,
  )
  lines.push(
    `Total cost basis: ${overview.totalCost.toFixed(2)} ${overview.displayCurrency}`,
  )
  lines.push(
    `Total P&L: ${overview.totalPnl >= 0 ? '+' : ''}${overview.totalPnl.toFixed(2)} ${overview.displayCurrency} (${overview.totalPnlPct.toFixed(2)}%)`,
  )
  lines.push(
    `Day change: ${overview.dayChange >= 0 ? '+' : ''}${overview.dayChange.toFixed(2)} ${overview.displayCurrency} (${overview.dayChangePct.toFixed(2)}%)`,
  )
  lines.push(
    `FX USD->CAD: ${overview.fxUsdToCad.toFixed(4)}${overview.fxStale ? ' (stale)' : ''}`,
  )
  lines.push('')

  // Period performance (1M / 1Y) for a sense of trend without dumping
  // the full chart series.
  try {
    const monthSeries = computePortfolioTimeSeries('month')
    const yearSeries = computePortfolioTimeSeries('year')
    if (monthSeries.points.length > 1) {
      lines.push(
        `1M performance: ${monthSeries.pnlPct >= 0 ? '+' : ''}${monthSeries.pnlPct.toFixed(2)}%`,
      )
    }
    if (yearSeries.points.length > 1) {
      lines.push(
        `1Y performance: ${yearSeries.pnlPct >= 0 ? '+' : ''}${yearSeries.pnlPct.toFixed(2)}%`,
      )
    }
  } catch {
    /* time series may not be ready on cold cache */
  }
  lines.push('')

  // Accounts.
  if (accounts.length > 0) {
    lines.push('=== ACCOUNTS ===')
    for (const a of accounts) {
      lines.push(`- ${a.name} (${a.kind.toUpperCase()})`)
    }
    lines.push('')
  }

  // Positions — sorted by market value descending, capped at the top
  // 20 so a giant portfolio still fits.
  lines.push('=== POSITIONS ===')
  const sorted = [...overview.positions].sort(
    (a, b) => b.marketValue - a.marketValue,
  )
  for (const p of sorted.slice(0, 20)) {
    const sectorLabel = p.sectorCode
      ? sectors.find((s) => s.code === p.sectorCode)?.labelEn ?? p.sectorCode
      : 'unclassified'
    lines.push(
      `- ${p.ticker} (${p.name ?? p.ticker}) | sector=${sectorLabel} | qty=${p.quantity} | avgCost=${p.avgCost.toFixed(2)} ${p.currency} | currentPrice=${p.currentPrice?.toFixed(2) ?? '—'} | weight=${p.weight.toFixed(2)}% | pnl=${p.pnl.toFixed(2)} ${overview.displayCurrency} (${p.pnlPct.toFixed(2)}%)`,
    )
  }
  if (sorted.length > 20) {
    lines.push(`(+ ${sorted.length - 20} smaller positions omitted)`)
  }
  lines.push('')

  // Sector allocation (look-through if present).
  if (overview.sectors.length > 0) {
    lines.push('=== SECTOR ALLOCATION (look-through) ===')
    for (const s of overview.sectors.slice(0, 12)) {
      lines.push(
        `- ${s.labelEn}: ${s.percent.toFixed(1)}% (${s.value.toFixed(0)} ${overview.displayCurrency})`,
      )
    }
    lines.push('')
  }

  // Recent transactions — last 10.
  if (txs.length > 0) {
    lines.push('=== RECENT TRANSACTIONS (last 10) ===')
    for (const tx of txs.slice(0, 10)) {
      lines.push(
        `- ${tx.occurredAt} | ${tx.kind.toUpperCase()} ${tx.quantity} ${tx.ticker} @ ${tx.price.toFixed(2)} ${tx.currency}`,
      )
    }
    lines.push('')
  }

  // Dividends — totals + last 5 payments. Keep terse.
  if (dividends.length > 0) {
    const byCcy: Record<string, number> = {}
    for (const d of dividends) {
      byCcy[d.currency] = (byCcy[d.currency] ?? 0) + d.amount
    }
    lines.push('=== DIVIDENDS / INCOME ===')
    for (const [ccy, total] of Object.entries(byCcy)) {
      lines.push(`- Total ${ccy}: ${total.toFixed(2)}`)
    }
    lines.push(`- Payment count: ${dividends.length}`)
    lines.push('Last 5 payments:')
    for (const d of dividends.slice(0, 5)) {
      lines.push(
        `  ${d.paidAt} | ${d.ticker ?? '—'} | ${d.amount.toFixed(2)} ${d.currency} (${d.kind})`,
      )
    }
    lines.push('')
  }

  return {
    text: lines.join('\n'),
    snapshot: {
      totalValue: overview.totalValue,
      displayCurrency: overview.displayCurrency,
      positionCount: overview.positions.length,
      accountCount: accounts.length,
      dividendCount: dividends.length,
    },
  }
}

const SYSTEM_PROMPT_FR = `Tu es un assistant financier integre a une app de gestion de portefeuille personnel. L'utilisateur te pose des questions sur SON portefeuille (le snapshot complet est fourni en contexte ci-dessous). Reponds en francais, de facon concise et factuelle.

Regles strictes :
1. Ne donne JAMAIS de conseil d'achat/vente specifique ("achete X", "vends Y"). Tu peux analyser, expliquer, suggerer des questions a se poser, mais pas recommander d'action de trading directe.
2. Tu n'as PAS acces a Internet ni a des donnees en temps reel autres que ce qui est dans le snapshot. Si une question demande des donnees externes (prix d'un ticker absent, news non listees), dis-le clairement.
3. Reponds dans la devise affichee par l'utilisateur quand pertinent. Mentionne FX si tu compares CAD vs USD.
4. Reste concis : reponses de 2-6 phrases sauf si l'utilisateur demande explicitement plus de detail.
5. Si la question est ambigue, demande une clarification.`

const SYSTEM_PROMPT_EN = `You are a financial assistant embedded in a personal portfolio app. The user asks questions about THEIR portfolio (full snapshot in context below). Answer concisely and factually.

Strict rules:
1. NEVER give specific buy/sell advice ("buy X", "sell Y"). You may analyze, explain, surface questions worth asking, but you can NOT recommend a trade.
2. You have NO Internet access and no real-time data beyond the snapshot. If a question asks about something not in the snapshot, say so.
3. Answer in the user's display currency when relevant. Mention FX when comparing CAD vs USD.
4. Stay concise: 2-6 sentences unless the user asks for more depth.
5. If a question is ambiguous, ask for clarification.`

export async function answerPortfolioQuestion(
  history: ChatMessageInput[],
  locale: 'fr' | 'en' = 'fr',
): Promise<PortfolioChatResult> {
  const { text: context, snapshot } = buildPortfolioContext()
  const system =
    (locale === 'fr' ? SYSTEM_PROMPT_FR : SYSTEM_PROMPT_EN) +
    '\n\n' +
    context

  // Bound the conversation history we send. Last 10 turns is plenty
  // for a coherent multi-turn discussion without ballooning tokens.
  // The system message (containing the portfolio snapshot) is sent
  // every turn since portfolio state can change between questions.
  const trimmedHistory = history.slice(-10)

  const messages = [
    { role: 'system' as const, content: system },
    ...trimmedHistory.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  ]

  const model = 'gpt-4o-mini'
  const result = await chatCompletion(messages, {
    model,
    temperature: 0.3,
    maxTokens: 600,
    timeoutMs: 60_000,
  })

  return {
    content: result.content,
    model,
    usage: result.usage,
    contextSnapshot: snapshot,
  }
}
