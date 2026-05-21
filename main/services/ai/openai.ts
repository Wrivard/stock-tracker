import { getApiKey } from '../settings-keys'

// Small wrapper around OpenAI's Chat Completions endpoint. We intentionally
// don't pull the official `openai` npm package — the API surface we need
// is one POST, and avoiding the dep keeps the bundle lean.

interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { role: string; content: string }
    finish_reason?: string
  }>
  error?: { message: string; type?: string }
  usage?: { prompt_tokens: number; completion_tokens: number }
}

export interface OpenAiCallResult {
  content: string
  usage: { promptTokens: number; completionTokens: number } | null
}

export async function chatCompletion(
  messages: ChatMessage[],
  opts?: {
    model?: string
    temperature?: number
    maxTokens?: number
    timeoutMs?: number
  },
): Promise<OpenAiCallResult> {
  const apiKey = getApiKey('openai')
  if (!apiKey) {
    throw new Error('OpenAI API key missing — set it in Settings.')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(
    () => controller.abort(),
    opts?.timeoutMs ?? 60_000,
  )

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: opts?.model ?? 'gpt-4o-mini',
        messages,
        temperature: opts?.temperature ?? 0.3,
        max_tokens: opts?.maxTokens ?? 800,
      }),
      signal: controller.signal,
    })
    const data = (await res.json()) as ChatCompletionResponse
    if (!res.ok) {
      throw new Error(
        data.error?.message ?? `OpenAI HTTP ${res.status}`,
      )
    }
    const content = data.choices?.[0]?.message?.content?.trim() ?? ''
    if (!content) {
      throw new Error('OpenAI returned an empty response')
    }
    return {
      content,
      usage: data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
          }
        : null,
    }
  } finally {
    clearTimeout(timeoutId)
  }
}
