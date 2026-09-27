// Shared (client + server) helpers. No secrets here.

// Simple keyword rules for "does this need current information?".
// Deliberately conservative: general-knowledge questions stay offline.
const SEARCH_PATTERNS = [
  /\b(search|google|look\s?up|browse)\b/i,
  /\bfind (me )?(the )?(latest|current|recent|newest|information|info|out)\b/i,
  /\b(latest|current|currently|recent|recently|breaking|newest|upcoming|today|tonight|tomorrow|yesterday|right now|live|news|headlines?|happening)\b/i,
  /\bthis (week|weekend|month|year|season)\b/i,
  /\b(weather|forecast|temperature outside|rain)\b/i,
  /\b(price|stock|stocks|shares|market cap|bitcoin|btc|ethereum|crypto|exchange rate)\b/i,
  /\b(who won|score|scores|standings|fixtures|election results?)\b/i,
  /\b20(2[4-9]|3\d)\b/,
]

export function needsWebSearch(message) {
  if (typeof message !== 'string') return false
  return SEARCH_PATTERNS.some((pattern) => pattern.test(message))
}

/** Turns "Search Google for the latest AI news" into "the latest AI news". */
export function extractSearchQuery(message) {
  const query = message
    .replace(/^(please\s+)?(can you\s+|could you\s+)?(search|google|look\s?up|find)(\s+(google|the web|online|the internet))?(\s+for)?\s+/i, '')
    .replace(/[?.!]+$/, '')
    .trim()
  return query || message
}

/** Strips markdown/URLs so ElevenLabs reads the reply naturally. */
export function toSpeechText(text) {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[*_#`>~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2500)
}

export function hostnameOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}
