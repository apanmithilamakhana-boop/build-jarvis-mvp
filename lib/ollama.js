// Server-only helper for talking to Ollama's HTTP API.
// Docs: https://github.com/ollama/ollama/blob/main/docs/api.md

export const JARVIS_SYSTEM_PROMPT = `You are JARVIS, a sophisticated personal AI assistant.

Your communication style is:
- concise
- intelligent
- calm
- professional
- slightly futuristic
- conversational

Do not give unnecessarily long answers.
When the user asks for current information, rely on provided search results.
Never pretend that you searched the web when you did not.
Do not mention internal implementation details unless asked.
Do not open every reply with the same phrase and do not overuse "sir".
Your replies are read aloud by a voice engine, so write in plain spoken sentences: no markdown, no bullet lists, no raw URLs.`

function getOllamaConfig() {
  // With an API key but no explicit URL, use hosted Ollama Cloud: in a
  // deployed app, localhost is the server itself, not the user's machine.
  const useCloud = !process.env.OLLAMA_URL && Boolean(process.env.OLLAMA_API_KEY?.trim())
  const defaultUrl = useCloud ? 'https://ollama.com' : 'http://localhost:11434'
  const defaultModel = useCloud ? 'gpt-oss:120b' : 'llama3.2'
  return {
    baseUrl: (process.env.OLLAMA_URL || defaultUrl).replace(/\/+$/, ''),
    model: process.env.OLLAMA_MODEL || defaultModel,
  }
}

function buildHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  // Optional: only needed for hosted Ollama (ollama.com) or a protected proxy.
  const apiKey = process.env.OLLAMA_API_KEY?.trim().replace(/^["']|["']$/g, '')
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`
  return headers
}

export class OllamaError extends Error {}

/**
 * Sends a full message list to Ollama and returns the assistant's text.
 * @param {{ role: 'system' | 'user' | 'assistant', content: string }[]} messages
 */
export async function chatWithOllama(messages) {
  const { baseUrl, model } = getOllamaConfig()

  let response
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: buildHeaders(),
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: { temperature: 0.6 },
      }),
      // Local models can be slow on first load, so allow a generous timeout.
      signal: AbortSignal.timeout(120_000),
    })
  } catch (error) {
    throw new OllamaError(`Could not reach Ollama at ${baseUrl}: ${error.message}`)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new OllamaError(`Ollama responded with ${response.status}: ${detail.slice(0, 300)}`)
  }

  // Ollama should return JSON, but never let a malformed body crash the route.
  const raw = await response.text()
  let content = raw
  try {
    content = JSON.parse(raw)?.message?.content ?? ''
  } catch {
    content = extractContentFromBrokenJson(raw)
  }

  const reply = cleanReply(content)
  if (!reply) throw new OllamaError('Ollama returned an empty response')
  return reply
}

/** Quick health check used by the status panel. */
export async function checkOllama() {
  const { baseUrl, model } = getOllamaConfig()
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      headers: buildHeaders(),
      signal: AbortSignal.timeout(3_000),
      cache: 'no-store',
    })
    if (!response.ok) return { online: false, model, modelInstalled: false }
    const data = await response.json().catch(() => ({}))
    const installed = (data.models || []).some(
      (m) => m.name === model || m.name === `${model}:latest` || m.model === model,
    )
    return { online: true, model, modelInstalled: installed }
  } catch {
    return { online: false, model, modelInstalled: false }
  }
}

function extractContentFromBrokenJson(raw) {
  const match = raw.match(/"content"\s*:\s*"((?:[^"\\]|\\.)*)"/)
  if (!match) return raw
  try {
    return JSON.parse(`"${match[1]}"`)
  } catch {
    return match[1]
  }
}

/**
 * Removes reasoning tags (deepseek-r1, qwen3, ...) and unwraps replies where
 * the model answered with a JSON object like {"reply": "..."}.
 */
function cleanReply(text) {
  if (typeof text !== 'string') return ''
  let reply = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()

  if (reply.startsWith('{') && reply.endsWith('}')) {
    try {
      const parsed = JSON.parse(reply)
      const candidate = parsed.reply ?? parsed.response ?? parsed.answer ?? parsed.message
      if (typeof candidate === 'string') reply = candidate.trim()
    } catch {
      // Not JSON after all — keep the text as-is.
    }
  }
  return reply
}
