import { generateText } from 'ai'
import { chatWithOllama } from '@/lib/ollama'

export const FALLBACK_MODEL = process.env.JARVIS_FALLBACK_MODEL || 'google/gemini-3.8-flash'

/**
 * Generates a reply with local Ollama first. When Ollama is unreachable
 * (e.g. the app runs in the cloud, where localhost is not your machine),
 * falls back to a hosted model through Vercel AI Gateway.
 * @returns {Promise<{ reply: string, engine: 'ollama' | 'cloud' }>}
 */
export async function generateReply(messages) {
  let ollamaError
  try {
    return { reply: await chatWithOllama(messages), engine: 'ollama' }
  } catch (error) {
    ollamaError = error
    console.warn('[jarvis] ollama unavailable, using cloud fallback:', error.message)
  }

  const instructions = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n\n')
  const conversation = messages.filter((m) => m.role !== 'system')

  let text
  try {
    ;({ text } = await generateText({
      model: FALLBACK_MODEL,
      instructions,
      messages: conversation,
      temperature: 0.6,
    }))
  } catch (gatewayError) {
    console.warn('[jarvis] cloud fallback failed:', gatewayError.message)
    throw new Error(`${ollamaError.message}. Cloud fallback also unavailable.`)
  }

  const reply = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim()
  if (!reply) throw new Error('Cloud fallback returned an empty response')
  return { reply, engine: 'cloud' }
}
