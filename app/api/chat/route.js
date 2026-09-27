import { checkOllama, JARVIS_SYSTEM_PROMPT } from '@/lib/ollama'
import { generateReply, FALLBACK_MODEL } from '@/lib/brain'
import { searchWeb, isSearchConfigured } from '@/lib/search'
import { isVoiceConfigured } from '@/lib/elevenlabs'
import { needsWebSearch, extractSearchQuery } from '@/lib/intent'

const MAX_MESSAGE_LENGTH = 2000
const MAX_HISTORY = 12

/**
 * POST { message, conversation, searchResults?, searchFailed? }
 *  -> { reply, needsSearch, sources, searchError }
 *
 * The client usually performs the search itself (so it can show SEARCHING)
 * and passes `searchResults`. If it doesn't, this route searches on its own.
 */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, MAX_MESSAGE_LENGTH) : ''
  if (!message) {
    return Response.json({ error: 'Message is required' }, { status: 400 })
  }

  const conversation = sanitizeConversation(body.conversation)
  const needsSearch = needsWebSearch(message)

  let sources = Array.isArray(body.searchResults) ? sanitizeResults(body.searchResults) : null
  let searchError = body.searchFailed ? 'WEB SEARCH UNAVAILABLE' : null

  if (needsSearch && !sources && !searchError) {
    try {
      sources = await searchWeb(extractSearchQuery(message))
    } catch (error) {
      console.error('[jarvis] search failed:', error.message)
      searchError = 'WEB SEARCH UNAVAILABLE'
    }
  }

  const messages = [
    {
      role: 'system',
      content: `${JARVIS_SYSTEM_PROMPT}\n\nCurrent date: ${new Date().toDateString()}.`,
    },
    ...conversation,
  ]

  if (needsSearch && sources?.length) {
    messages.push({ role: 'system', content: formatSearchContext(sources) })
  } else if (needsSearch) {
    messages.push({
      role: 'system',
      content:
        'Web search was attempted for this request but returned no usable results. Do not claim to have current information; briefly say you could not retrieve live data and answer only from general knowledge if appropriate.',
    })
  }

  messages.push({ role: 'user', content: message })

  try {
    const { reply, engine } = await generateReply(messages)
    return Response.json({
      reply,
      engine,
      needsSearch,
      sources: needsSearch ? sources || [] : [],
      searchError,
    })
  } catch (error) {
    console.error('[jarvis] all AI engines failed:', error.message)
    return Response.json(
      { error: 'JARVIS CORE OFFLINE', detail: error.message, needsSearch },
      { status: 503 },
    )
  }
}

/** GET -> subsystem status for the HUD. */
export async function GET() {
  const ollama = await checkOllama()
  return Response.json(
    {
      ollama,
      fallback: { model: FALLBACK_MODEL },
      search: { configured: isSearchConfigured() },
      voice: { configured: isVoiceConfigured() },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}

function formatSearchContext(results) {
  const lines = results.map(
    (result, index) => `[${index + 1}] ${result.title}\nURL: ${result.url}\n${result.snippet}`,
  )
  return `The following are CURRENT WEB SEARCH RESULTS retrieved moments ago for the user's next message.
Answer using these results. Do not invent facts that are not supported by them. If they do not contain the answer, say so briefly.
Do not read URLs aloud; the sources are shown to the user separately.

${lines.join('\n\n')}`
}

function sanitizeConversation(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))
}

function sanitizeResults(value) {
  return value
    .filter((r) => typeof r?.url === 'string' && /^https?:\/\//i.test(r.url))
    .slice(0, 6)
    .map((r) => ({
      title: String(r.title || r.url).slice(0, 200),
      url: r.url,
      snippet: String(r.snippet || '').slice(0, 500),
    }))
}
