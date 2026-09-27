// Server-only ElevenLabs text-to-speech helper.
// Docs: https://elevenlabs.io/docs/api-reference/text-to-speech/convert

export class VoiceError extends Error {}

// "Daniel" — a premade British voice available on every ElevenLabs account.
const DEFAULT_VOICE_ID = 'onwK4e9ZLuTAKqWW03F9'

export function isVoiceConfigured() {
  return Boolean(process.env.ELEVENLABS_API_KEY)
}

/**
 * Converts text to MP3 audio.
 * @param {string} text
 * @returns {Promise<ArrayBuffer>}
 */
export async function synthesizeSpeech(text) {
  const apiKey = process.env.ELEVENLABS_API_KEY
  const voiceId = process.env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE_ID
  if (!apiKey) {
    throw new VoiceError('ELEVENLABS_API_KEY must be set')
  }

  // Flash is ElevenLabs' low-latency model; override with ELEVENLABS_MODEL_ID if you prefer.
  const modelId = process.env.ELEVENLABS_MODEL_ID || 'eleven_flash_v2_5'

  let response
  try {
    response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: modelId,
          voice_settings: { stability: 0.5, similarity_boost: 0.8, style: 0.15 },
        }),
        signal: AbortSignal.timeout(30_000),
      },
    )
  } catch (error) {
    throw new VoiceError(`Could not reach ElevenLabs: ${error.message}`)
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new VoiceError(`ElevenLabs responded with ${response.status}: ${detail.slice(0, 300)}`)
  }

  return response.arrayBuffer()
}
