import Head from 'next/head'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Send, Sparkles, Trash2 } from 'lucide-react'

import type {
  ChatMessageInput,
  PortfolioChatResult,
} from '../../main/services/ai/portfolio-qa'
import { api } from '@/lib/api'
import { useUi } from '@/lib/store'
import { useT } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'

type Msg = ChatMessageInput

export default function AssistantPage() {
  const { t, locale } = useT()
  const apiKeyStatus = useUi((s) => s.apiKeyStatus)

  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [lastUsage, setLastUsage] =
    useState<PortfolioChatResult['usage']>(null)
  const inFlightRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll the conversation to the latest message when new ones land.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, thinking])

  async function send(text: string) {
    const content = text.trim()
    if (!content) return
    if (!apiKeyStatus.openai) {
      toast.error(t('assistant.noKey'))
      return
    }
    if (inFlightRef.current) return
    inFlightRef.current = true
    const next: Msg[] = [...messages, { role: 'user', content }]
    setMessages(next)
    setInput('')
    setThinking(true)
    try {
      const res = await api().ai.portfolioChat(next, locale)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: res.content },
      ])
      setLastUsage(res.usage)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err))
    } finally {
      setThinking(false)
      inFlightRef.current = false
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    void send(input)
  }

  function handleSuggestion(s: string) {
    void send(s)
  }

  function handleClear() {
    setMessages([])
    setLastUsage(null)
  }

  return (
    <>
      <Head>
        <title>{`${t('assistant.title')} · Beta Trading Hub`}</title>
      </Head>
      <div className="p-6 max-w-4xl mx-auto space-y-5">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-semibold tracking-tight flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              {t('assistant.title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {t('assistant.subtitle')}
            </p>
          </div>
          {messages.length > 0 && (
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Trash2 className="size-3.5" />
              {t('assistant.clear')}
            </Button>
          )}
        </header>

        {!apiKeyStatus.openai && (
          <Card className="border-amber-500/30 bg-amber-500/5">
            <CardHeader>
              <CardTitle className="text-sm text-amber-500">
                {t('assistant.noKey')}
              </CardTitle>
            </CardHeader>
          </Card>
        )}

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {locale === 'fr' ? 'Conversation' : 'Conversation'}
            </CardTitle>
            <CardDescription className="text-xs">
              {lastUsage
                ? `gpt-4o-mini · ${lastUsage.promptTokens} → ${lastUsage.completionTokens} tokens`
                : t('assistant.disclaimer')}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              ref={scrollRef}
              className="max-h-[480px] min-h-[280px] overflow-y-auto space-y-3 rounded-lg border border-border bg-muted/20 p-3"
            >
              {messages.length === 0 && !thinking && (
                <div className="text-center py-12 space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {t('assistant.empty')}
                  </p>
                  <div className="flex flex-col gap-1.5 items-center">
                    {[
                      t('assistant.suggestion1'),
                      t('assistant.suggestion2'),
                      t('assistant.suggestion3'),
                    ].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => handleSuggestion(s)}
                        disabled={!apiKeyStatus.openai}
                        className="text-xs text-primary hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        “{s}”
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => (
                <div
                  key={i}
                  className={cn(
                    'flex',
                    m.role === 'user' ? 'justify-end' : 'justify-start',
                  )}
                >
                  <div
                    className={cn(
                      'max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed',
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-card border border-border',
                    )}
                  >
                    {m.content}
                  </div>
                </div>
              ))}
              {thinking && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] rounded-lg px-3 py-2 text-sm bg-card border border-border flex items-center gap-2">
                    <Sparkles className="size-3.5 text-primary animate-pulse" />
                    <span className="text-muted-foreground">
                      {t('assistant.thinking')}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} className="flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder={t('assistant.placeholder')}
                disabled={thinking || !apiKeyStatus.openai}
                className="min-w-0 flex-1"
                autoComplete="off"
              />
              <Button
                type="submit"
                disabled={thinking || !apiKeyStatus.openai || !input.trim()}
              >
                <Send className="size-3.5" />
                {t('assistant.send')}
              </Button>
            </form>

            <p className="text-[10px] text-muted-foreground/80 text-center">
              {t('assistant.disclaimer')}
            </p>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
