// Client-side speech recognition + wake word manager (Web Speech API).
//
// Modes:
//   off     – recognition stopped
//   passive – always listening, only reacts to the wake word
//   active  – the next finished utterance is treated as a command
//
// To swap in Porcupine later, replace the wake-word check in handleResult()
// (or call startListening() from Porcupine's detection callback).

const WAKE_WORD_TEST = /\b(jarvis|jarvas|jervis)\b/i
const WAKE_WORD_STRIP = /\b(?:(?:hey|hi|ok|okay|yo)[\s,]+)?(?:jarvis|jarvas|jervis)\b[\s,.!?:;-]*/gi

export function containsWakeWord(text) {
  return WAKE_WORD_TEST.test(text)
}

/** "Jarvis, what is happening in AI today?" -> "What is happening in AI today?" */
export function stripWakeWord(text) {
  const cleaned = text
    .replace(WAKE_WORD_STRIP, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s,.!?:;-]+/, '')
    .replace(/[\s,:;-]+$/, '')
    .trim()
  return cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : ''
}

export function isSpeechRecognitionSupported() {
  return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition)
}

const ACTIVE_TIMEOUT_MS = 8000

export class SpeechManager {
  /**
   * @param {{
   *   onModeChange?: (mode: 'off' | 'passive' | 'active') => void,
   *   onWake?: () => void,
   *   onCommand?: (text: string) => void,
   *   onInterim?: (text: string) => void,
   *   onError?: (message: string, code: string) => void,
   * }} handlers
   */
  constructor(handlers = {}) {
    this.handlers = handlers
    this.recognition = null
    this.mode = 'off'
    this.wakeEnabled = false
    this.running = false
    this.fatal = false
    this.activeTimer = null
    this.restartTimer = null
  }

  setHandlers(handlers) {
    this.handlers = handlers
  }

  enableWakeWord(enabled) {
    this.wakeEnabled = enabled
    if (enabled) {
      this.fatal = false
      if (this.mode === 'off') this.setMode('passive')
      this.run()
    } else if (this.mode === 'passive') {
      this.setMode('off')
      this.halt()
    }
  }

  startListening() {
    this.fatal = false
    this.setMode('active')
    this.armTimeout()
    this.run()
  }

  stopListening() {
    clearTimeout(this.activeTimer)
    this.handlers.onInterim?.('')
    if (this.wakeEnabled) {
      this.setMode('passive')
    } else {
      this.setMode('off')
      this.halt()
    }
  }

  destroy() {
    clearTimeout(this.activeTimer)
    clearTimeout(this.restartTimer)
    this.mode = 'off'
    if (this.recognition) {
      this.recognition.onend = null
      try {
        this.recognition.abort()
      } catch {}
    }
  }

  // ---- internals ---------------------------------------------------------

  setMode(mode) {
    if (this.mode === mode) return
    this.mode = mode
    this.handlers.onModeChange?.(mode)
  }

  ensureRecognition() {
    if (this.recognition) return this.recognition
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = navigator.language || 'en-US'
    recognition.maxAlternatives = 1

    recognition.onstart = () => {
      this.running = true
    }
    recognition.onresult = (event) => this.handleResult(event)
    recognition.onerror = (event) => this.handleError(event)
    // Browsers end continuous recognition after silence; restart while needed.
    recognition.onend = () => {
      this.running = false
      if (this.mode !== 'off' && !this.fatal) {
        clearTimeout(this.restartTimer)
        this.restartTimer = setTimeout(() => this.run(), 300)
      }
    }

    this.recognition = recognition
    return recognition
  }

  run() {
    if (this.running || this.fatal || !isSpeechRecognitionSupported()) return
    try {
      this.ensureRecognition().start()
    } catch {
      // start() throws if recognition is already starting — safe to ignore.
    }
  }

  halt() {
    clearTimeout(this.restartTimer)
    try {
      this.recognition?.stop()
    } catch {}
  }

  armTimeout() {
    clearTimeout(this.activeTimer)
    this.activeTimer = setTimeout(() => {
      if (this.mode === 'active') this.stopListening()
    }, ACTIVE_TIMEOUT_MS)
  }

  handleResult(event) {
    let interim = ''
    const finals = []
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (result.isFinal) finals.push(result[0].transcript)
      else interim += result[0].transcript
    }

    // Instant feedback: react to the wake word before the sentence is finished.
    if (interim) {
      if (this.mode === 'passive' && containsWakeWord(interim)) {
        this.setMode('active')
        this.armTimeout()
        this.handlers.onWake?.()
      } else if (this.mode === 'active') {
        this.armTimeout()
        this.handlers.onInterim?.(stripWakeWord(interim))
      }
    }

    for (const transcript of finals) {
      if (this.mode === 'passive') {
        if (!containsWakeWord(transcript)) continue
        this.handlers.onWake?.()
        const command = stripWakeWord(transcript)
        if (command) {
          this.stopListening()
          this.handlers.onCommand?.(command)
          return
        }
        // Only "Jarvis" was said — wait for the actual request.
        this.setMode('active')
        this.armTimeout()
      } else if (this.mode === 'active') {
        const command = stripWakeWord(transcript)
        if (!command) continue
        this.stopListening()
        this.handlers.onCommand?.(command)
        return
      }
    }
  }

  handleError(event) {
    const fail = (message) => {
      this.fatal = true
      this.wakeEnabled = false
      clearTimeout(this.activeTimer)
      this.setMode('off')
      this.handlers.onError?.(message, event.error)
    }

    switch (event.error) {
      case 'no-speech':
      case 'aborted':
        return
      case 'not-allowed':
      case 'service-not-allowed':
        return fail('MICROPHONE ACCESS DENIED')
      case 'audio-capture':
        return fail('NO MICROPHONE DETECTED')
      case 'network':
        return fail('SPEECH SERVICE UNAVAILABLE')
      default:
        this.handlers.onError?.('SPEECH RECOGNITION ERROR', event.error)
    }
  }
}
