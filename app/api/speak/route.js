import { synthesizeSpeech } from '@/lib/elevenlabs'
import { toSpeechText } from '@/lib/intent'

/** POST { text } -> audio/mpeg */
export async function POST(request) {
  let body
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const text = typeof body?.text === 'string' ? toSpeechText(body.text) : ''
  if (!text) {
    return Response.json({ error: 'Text is required' }, { status: 400 })
  }

  try {
    const audio = await synthesizeSpeech(text)
    return new Response(audio, {
      headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    console.error('[jarvis] elevenlabs failed:', error.message)
    return Response.json({ error: 'VOICE SYSTEM UNAVAILABLE', detail: error.message }, { status: 503 })
  }
}
