import { searchWeb } from '@/lib/search'
import { extractSearchQuery } from '@/lib/intent'

/** POST { query } -> { query, results: [{ title, url, snippet }] } */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const raw = typeof body?.query === 'string' ? body.query.trim().slice(0, 500) : ''
  if (!raw) {
    return Response.json({ error: 'Query is required' }, { status: 400 })
  }

  const query = extractSearchQuery(raw)

  try {
    const results = await searchWeb(query)
    return Response.json({ query, results })
  } catch (error) {
    console.error('[jarvis] search failed:', error.message)
    return Response.json({ error: 'WEB SEARCH UNAVAILABLE', detail: error.message }, { status: 502 })
  }
}
