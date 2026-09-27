'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import useSWR from 'swr'
import { Mic, MicOff, Radio, Trash2, Volume2, VolumeX } from 'lucide-react'
import JarvisCore from '@/components/JarvisCore'
import VoiceWave from '@/components/VoiceWave'
import StatusDisplay, { SystemInfo } from '@/components/StatusDisplay'
import ChatHistory from '@/components/ChatHistory'
import CommandInput from '@/components/CommandInput'
import { SpeechManager, isSpeechRecognitionSupported } from '@/lib/speech'
import { needsWebSearch } from '@/lib/intent'
import { cn } from '@/lib/utils'

const fetcher = (url) => fetch(url).then((res) => res.json())
const subscribeNoop = () => () => {}
const createId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()))

async function postJson(url, payload) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`)
  return data
}

export default function JarvisApp() {
  const [messages, setMessages] = useState([])
  const [phase, setPhase] = useState(null) // 'THINKING' | 'SEARCHING' | null
  const [speaking, setSpeaking] = useState(false)
  const [listenMode, setListenMode] = useState('off') // 'off' | 'passive' | 'active'
  const [interim, setInterim] = useState('')
  const [wakeEnabled, setWakeEnabled] = useState(false)
  const [voiceEnabled, setVoiceEnabled] = useState(true)
  const [notices, setNotices] = useState([])

  const speechSupported = useSyncExternalStore(subscribeNoop, isSpeechRecognitionSupported, () => true)
  const { data: systemStatus, isLoading: statusLoading } = useSWR('/api/chat', fetcher, {
    refreshInterval: 30_000,
  })

  const messagesRef = useRef(messages)
  const busyRef = useRef(false)
  const managerRef = useRef(null)
  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const analyserRef = useRef(null)
  const audioUrlRef = useRef(null)
  const speechTokenRef = useRef(0)

  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  // The single source of truth for what the HUD shows.
  const status = phase ?? (speaking ? 'SPEAKING' : listenMode === 'active' ? 'LISTENING' : 'IDLE')

  function notify(message) {
    const id = createId()
    setNotices((prev) => (prev.some((n) => n.message === message) ? prev : [...prev, { id, message }]))
    setTimeout(() => setNotices((prev) => prev.filter((n) => n.id !== id)), 6000)
  }

  // ---- Audio output ------------------------------------------------------

  // Created on a user gesture so browsers allow playback + Web Audio later.
  function ensureAudio() {
    if (!audioRef.current) {
      const audio = new Audio()
      audio.preload = 'auto'
      audio.onended = () => setSpeaking(false)
      audio.onerror = () => {
        if (audio.src) setSpeaking(false)
      }
      audioRef.current = audio

      try {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext
        if (AudioContextClass) {
          const context = new AudioContextClass()
          const source = context.createMediaElementSource(audio)
          const analyser = context.createAnalyser()
          analyser.fftSize = 512
          analyser.smoothingTimeConstant = 0.8
          source.connect(analyser)
          analyser.connect(context.destination)
          audioContextRef.current = context
          analyserRef.current = analyser
        }
      } catch {
        // Web Audio unavailable — plain playback still works, just no reactive glow.
      }
    }
    audioContextRef.current?.resume?.().catch(() => {})
    return audioRef.current
  }

  function stopAudio() {
    speechTokenRef.current += 1
    audioRef.current?.pause()
    setSpeaking(false)
  }

  async function speak(text) {
    const token = ++speechTokenRef.current
    setSpeaking(true)

    let blob
    try {
      const res = await fetch('/api/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })
      if (!res.ok) throw new Error('VOICE SYSTEM UNAVAILABLE')
      blob = await res.blob()
    } catch {
      if (token === speechTokenRef.current) {
        setSpeaking(false)
        notify('VOICE SYSTEM UNAVAILABLE')
      }
      return
    }

    // The user may have interrupted while the audio was being generated.
    if (token !== speechTokenRef.current) return

    const audio = ensureAudio()
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current)
    audioUrlRef.current = URL.createObjectURL(blob)
    audio.src = audioUrlRef.current
    try {
      await audio.play()
    } catch {
      setSpeaking(false)
      notify('AUDIO BLOCKED — CLICK ANYWHERE ONCE TO ENABLE VOICE')
    }
  }

  // ---- Request pipeline (shared by voice + text) -------------------------

  async function processRequest(raw) {
    const text = raw.trim()
    if (!text) return
    if (busyRef.current) {
      notify('STILL PROCESSING PREVIOUS REQUEST')
      return
    }
    busyRef.current = true
    stopAudio()

    const conversation = messagesRef.current
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-10)
      .map(({ role, content }) => ({ role, content }))

    setMessages((prev) => [...prev, { id: createId(), role: 'user', content: text }])
    setPhase('THINKING')

    try {
      // 1. Web search when the question needs current information.
      let searchResults
      let searchFailed = false
      if (needsWebSearch(text)) {
        setPhase('SEARCHING')
        try {
          const data = await postJson('/api/search', { query: text })
          searchResults = data.results || []
        } catch {
          searchFailed = true
          notify('WEB SEARCH UNAVAILABLE')
        }
        setPhase('THINKING')
      }

      // 2. Ollama generates the answer (with search context if any).
      let data
      try {
        data = await postJson('/api/chat', { message: text, conversation, searchResults, searchFailed })
        if (!data.reply) throw new Error('Empty reply')
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: createId(),
            role: 'system',
            content: 'JARVIS CORE OFFLINE',
            detail: 'Could not reach Ollama. Make sure "ollama serve" is running and OLLAMA_URL / OLLAMA_MODEL are correct.',
          },
        ])
        notify('JARVIS CORE OFFLINE')
        return
      }

      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: 'assistant',
          content: data.reply,
          sources: data.sources || [],
          searched: Boolean(data.needsSearch && data.sources?.length),
        },
      ])

      // 3. ElevenLabs speaks the answer.
      busyRef.current = false
      setPhase(null)
      if (voiceEnabled) await speak(data.reply)
    } finally {
      busyRef.current = false
      setPhase(null)
    }
  }

  // ---- Speech recognition wiring ----------------------------------------

  useEffect(() => {
    if (!isSpeechRecognitionSupported()) return
    const manager = new SpeechManager()
    managerRef.current = manager
    return () => {
      manager.destroy()
      managerRef.current = null
    }
  }, [])

  // Keep the manager's callbacks pointing at the latest render's closures.
  useEffect(() => {
    managerRef.current?.setHandlers({
      onModeChange: setListenMode,
      onInterim: setInterim,
      onWake: () => stopAudio(),
      onCommand: (command) => {
        setInterim('')
        processRequest(command)
      },
      onError: (message, code) => {
        notify(message)
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          notify('ALLOW MIC ACCESS — OR OPEN THE APP IN ITS OWN TAB')
        }
        if (['not-allowed', 'service-not-allowed', 'audio-capture', 'network'].includes(code)) {
          setWakeEnabled(false)
        }
      },
    })
  })

  function handleMicClick() {
    ensureAudio()
    const manager = managerRef.current
    if (!manager) {
      notify('SPEECH RECOGNITION UNAVAILABLE — USE TEXT INPUT')
      return
    }
    if (listenMode === 'active') {
      manager.stopListening()
      return
    }
    stopAudio()
    manager.startListening()
  }

  function handleWakeToggle() {
    ensureAudio()
    const manager = managerRef.current
    if (!manager) {
      notify('SPEECH RECOGNITION UNAVAILABLE — USE TEXT INPUT')
      return
    }
    const next = !wakeEnabled
    setWakeEnabled(next)
    manager.enableWakeWord(next)
  }

  function handleVoiceToggle() {
    if (voiceEnabled) stopAudio()
    setVoiceEnabled((v) => !v)
  }

  function handleTextSubmit(text) {
    ensureAudio()
    processRequest(text)
  }

  const listening = listenMode === 'active'
  const busy = phase !== null

  return (
    <div className="hud-bg relative min-h-dvh overflow-hidden">
      <div aria-hidden="true" className="scan-sweep" />

      <div className="relative mx-auto flex min-h-dvh max-w-[1500px] flex-col gap-4 p-4 md:p-6 lg:h-dvh lg:flex-row">
        <main className="flex flex-1 flex-col gap-6 lg:min-h-0">
          <header className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="font-mono text-2xl font-semibold tracking-[0.4em] text-foreground md:text-3xl">
                J.A.R.V.I.S.
              </h1>
              <p className="mt-1 font-mono text-[10px] tracking-[0.25em] text-muted-foreground">
                JUST A RATHER VERY INTELLIGENT SYSTEM
              </p>
            </div>
            <SystemInfo data={systemStatus} isLoading={statusLoading} />
          </header>

          <section
            aria-label="Voice assistant"
            className="flex flex-1 flex-col items-center justify-center gap-5 py-4"
          >
            <JarvisCore status={status} analyserRef={analyserRef} />
            <VoiceWave status={status} analyserRef={analyserRef} />
            <StatusDisplay status={status} wakeArmed={wakeEnabled && listenMode !== 'off'} />

            <p className="min-h-6 max-w-xl text-balance text-center text-sm italic text-foreground/80" aria-live="polite">
              {listening && interim ? `“${interim}”` : ''}
            </p>

            <div className="flex items-center gap-3 md:gap-5 [&>button:not([aria-label])]:whitespace-nowrap">
              <button
                type="button"
                onClick={handleWakeToggle}
                disabled={!speechSupported}
                aria-pressed={wakeEnabled}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-full border px-3 font-mono text-[10px] tracking-[0.15em] transition-colors disabled:opacity-40 md:px-4 md:tracking-[0.2em]',
                  wakeEnabled
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                <Radio className="size-3.5" aria-hidden="true" />
                WAKE WORD {wakeEnabled ? 'ON' : 'OFF'}
              </button>

              <button
                type="button"
                onClick={handleMicClick}
                disabled={!speechSupported}
                aria-pressed={listening}
                className={cn(
                  'relative flex size-16 items-center justify-center rounded-full border transition-all disabled:opacity-40 md:size-20',
                  listening
                    ? 'border-primary bg-primary/20 text-primary shadow-[0_0_40px_oklch(0.84_0.12_205/0.45)]'
                    : 'border-primary/40 bg-background/60 text-primary hover:border-primary hover:shadow-[0_0_28px_oklch(0.84_0.12_205/0.3)]',
                )}
              >
                {listening && (
                  <span className="absolute inset-0 animate-ping rounded-full border border-primary/40" aria-hidden="true" />
                )}
                {speechSupported ? (
                  <Mic className="size-6 md:size-7" aria-hidden="true" />
                ) : (
                  <MicOff className="size-6 md:size-7" aria-hidden="true" />
                )}
                <span className="sr-only">{listening ? 'Stop listening' : 'Start listening'}</span>
              </button>

              <button
                type="button"
                onClick={handleVoiceToggle}
                aria-pressed={voiceEnabled}
                className={cn(
                  'flex h-10 items-center gap-2 rounded-full border px-3 font-mono text-[10px] tracking-[0.15em] transition-colors md:px-4 md:tracking-[0.2em]',
                  voiceEnabled
                    ? 'border-primary/60 bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                )}
              >
                {voiceEnabled ? (
                  <Volume2 className="size-3.5" aria-hidden="true" />
                ) : (
                  <VolumeX className="size-3.5" aria-hidden="true" />
                )}
                VOICE {voiceEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            {!speechSupported && (
              <p className="font-mono text-[10px] tracking-[0.2em] text-destructive">
                SPEECH RECOGNITION UNAVAILABLE IN THIS BROWSER — USE TEXT INPUT
              </p>
            )}
          </section>

          <div className="flex min-h-8 flex-wrap justify-center gap-2" role="alert" aria-live="assertive">
            {notices.map((notice) => (
              <span
                key={notice.id}
                className="rounded-sm border border-destructive/50 bg-destructive/10 px-3 py-1 font-mono text-[10px] tracking-[0.2em] text-destructive animate-in fade-in slide-in-from-bottom-1"
              >
                {notice.message}
              </span>
            ))}
          </div>
        </main>

        <aside
          aria-label="Conversation"
          className="glass-panel flex h-[70dvh] flex-col overflow-hidden rounded-lg lg:h-auto lg:w-[420px] lg:shrink-0"
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">CONVERSATION LOG</h2>
            <button
              type="button"
              onClick={() => setMessages([])}
              disabled={messages.length === 0 || busy}
              className="inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-primary/10 hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Clear conversation</span>
            </button>
          </div>
          <ChatHistory messages={messages} busy={busy} onSuggestion={handleTextSubmit} />
          <CommandInput busy={busy} onSubmit={handleTextSubmit} />
        </aside>
      </div>
    </div>
  )
}
