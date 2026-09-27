// Server-only web search abstraction.
// The rest of the app only calls searchWeb(query) and receives
// normalized results: [{ title, url, snippet }]. Swap providers here.

export class SearchError extends Error {}

export function isSearchConfigured() {
  return Boolean(process.env.SEARCH_API_URL && process.env.SEARCH_API_KEY)
}

/**
 * @param {string} query
 * @param {{ limit?: number }} [options]
 * @returns {Promise<{ title: string, url: string, snippet: string }[]>}
 */
export async function searchWeb(query, { limit = 5 } = {}) {
  const apiUrl = process.env.SEARCH_API_URL
  const apiKey = process.env.SEARCH_API_KEY
  if (!apiUrl || !apiKey) {
    throw new SearchError('SEARCH_API_URL and SEARCH_API_KEY must be set')
  }

  const request = buildProviderRequest(apiUrl, apiKey, query, limit)

  let response
  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
  } catch (error) {
    throw new SearchError(`Search request failed: ${error.message}`)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new SearchError(`Search API responded with ${response.status}: ${detail.slice(0, 300)}`)
  }

  const data = await response.json().catch(() => {
    throw new SearchError('Search API returned invalid JSON')
  })

  return normalizeResults(data).slice(0, limit)
}

/* ------------------------------------------------------------------------ *
 * PROVIDER-SPECIFIC REQUEST — ADAPT HERE
 *
 * The provider is detected from SEARCH_API_URL. Supported out of the box:
 *   SearchApi.io     https://www.searchapi.io/api/v1/search
 *   SerpApi          https://serpapi.com/search.json
 *   Serper           https://google.serper.dev/search
 *   Brave Search     https://api.search.brave.com/res/v1/web/search
 *   Tavily           https://api.tavily.com/search
 *   Google CSE       https://www.googleapis.com/customsearch/v1?cx=YOUR_CX
 *
 * Any other URL gets a generic GET ?q=...&api_key=... with a Bearer header.
 * If your provider needs something different, edit this function only.
 * ------------------------------------------------------------------------ */
function buildProviderRequest(apiUrl, apiKey, query, limit) {
  const url = new URL(apiUrl)
  const host = url.hostname

  if (host.includes('serper.dev')) {
    return {
      url: url.toString(),
      method: 'POST',
      headers: { 'X-API-KEY': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: limit }),
    }
  }

  if (host.includes('tavily.com')) {
    return {
      url: url.toString(),
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, max_results: limit, api_key: apiKey }),
    }
  }

  if (host.includes('search.brave.com')) {
    url.searchParams.set('q', query)
    url.searchParams.set('count', String(limit))
    return {
      url: url.toString(),
      method: 'GET',
      headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
    }
  }

  if (host.includes('googleapis.com')) {
    url.searchParams.set('q', query)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('num', String(Math.min(limit, 10)))
    return { url: url.toString(), method: 'GET', headers: { Accept: 'application/json' } }
  }

  // SearchApi.io, SerpApi and generic providers.
  url.searchParams.set('q', query)
  url.searchParams.set('api_key', apiKey)
  if ((host.includes('searchapi.io') || host.includes('serpapi.com')) && !url.searchParams.has('engine')) {
    url.searchParams.set('engine', 'google')
  }
  return {
    url: url.toString(),
    method: 'GET',
    headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' },
  }
}

/** Maps the many provider response shapes onto { title, url, snippet }. */
function normalizeResults(data) {
  const results = []

  // Answer boxes are useful for weather, prices, scores, etc.
  const answer = data?.answer_box || data?.answerBox
  if (answer) {
    const snippet = [answer.answer, answer.snippet, answer.result, answer.temperature && `${answer.temperature}°`, answer.weather, answer.price]
      .filter(Boolean)
      .join(' — ')
    const url = answer.link || answer.url
    if (snippet && isHttpUrl(url)) {
      results.push({ title: answer.title || 'Answer', url, snippet })
    }
  }

  const list =
    data?.organic_results ||
    data?.organic ||
    data?.items ||
    data?.results ||
    data?.web?.results ||
    data?.data ||
    []

  for (const item of Array.isArray(list) ? list : []) {
    const url = item.link || item.url || item.href
    if (!isHttpUrl(url)) continue
    results.push({
      title: String(item.title || item.name || url).slice(0, 200),
      url,
      snippet: String(item.snippet || item.description || item.content || '').slice(0, 500),
    })
  }

  return results
}

function isHttpUrl(value) {
  if (typeof value !== 'string') return false
  try {
    const { protocol } = new URL(value)
    return protocol === 'http:' || protocol === 'https:'
  } catch {
    return false
  }
}
