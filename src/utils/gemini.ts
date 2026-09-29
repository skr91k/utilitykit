// Gemini REST client for browser-only tools. No key is bundled: each user supplies
// their own, which the calling page keeps in that browser's localStorage.

export const DEFAULT_GEMINI_KEY = ''

export const GEMINI_MODELS = ['gemini-flash-lite-latest', 'gemini-flash-latest', 'gemini-2.5-flash', 'gemini-pro-latest']

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
  promptFeedback?: { blockReason?: string }
  error?: { message?: string }
}

export async function generateText(opts: {
  apiKey: string
  model: string
  system: string
  prompt: string
  temperature?: number
  signal?: AbortSignal
}): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${opts.model}:generateContent`, {
    method: 'POST',
    // Header instead of ?key= so the key doesn't end up in URL logs
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: opts.system }] },
      contents: [{ role: 'user', parts: [{ text: opts.prompt }] }],
      generationConfig: { temperature: opts.temperature ?? 0.4 },
    }),
    signal: opts.signal,
  })
  const data: GeminiResponse = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error?.message || `Gemini error ${res.status}`)
  if (data.promptFeedback?.blockReason) throw new Error(`Blocked by Gemini: ${data.promptFeedback.blockReason}`)
  const parts = data.candidates?.[0]?.content?.parts ?? []
  const text = parts.filter(p => !p.thought).map(p => p.text ?? '').join('')
  if (!text.trim()) throw new Error('Gemini returned an empty response')
  return text
}
