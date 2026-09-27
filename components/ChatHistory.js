'use client'

import { useEffect, useRef } from 'react'
import { AlertTriangle, ArrowUpRight, Globe } from 'lucide-react'
import { hostnameOf } from '@/lib/intent'

const SUGGESTIONS = ["What's the latest AI news?", 'Explain recursion in one sentence.', "What's 25 times 40?"]

export default function ChatHistory({ messages, busy, onSuggestion }) {
  const scrollRef = useRef(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [messages, busy])

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
      {messages.length === 0 ? (
        <div className="flex h-full flex-col justify-center gap-4">
          <p className="font-mono text-[10px] tracking-[0.25em] text-muted-foreground">NO ACTIVE SESSION</p>
          <p className="text-pretty text-sm leading-relaxed text-muted-foreground">
            Say <span className="text-primary">&ldquo;Jarvis&rdquo;</span> with the wake word armed, tap the
            microphone, or type below.
          </p>
          <ul className="flex flex-col gap-2">
            {SUGGESTIONS.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => onSuggestion(suggestion)}
                  className="w-full rounded-md border border-border px-3 py-2 text-left text-sm text-foreground/80 transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <ol className="flex flex-col gap-5" aria-live="polite" aria-label="Conversation">
          {messages.map((message) => (
            <li key={message.id}>
              <Message message={message} />
            </li>
          ))}
          {busy && (
            <li className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] text-primary/70">
              <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden="true" />
              JARVIS IS PROCESSING
            </li>
          )}
        </ol>
      )}
    </div>
  )
}

function Message({ message }) {
  if (message.role === 'system') {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5">
        <p className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] text-destructive">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          {message.content}
        </p>
        {message.detail && <p className="mt-1.5 text-xs leading-relaxed text-foreground/70">{message.detail}</p>}
      </div>
    )
  }

  const isUser = message.role === 'user'
  return (
    <article className={isUser ? 'border-l border-muted-foreground/30 pl-3' : 'border-l border-primary/60 pl-3'}>
      <header className="mb-1 flex items-center gap-2">
        <span
          className={`font-mono text-[10px] tracking-[0.25em] ${isUser ? 'text-muted-foreground' : 'text-primary'}`}
        >
          {isUser ? 'USER' : 'JARVIS'}
        </span>
        {message.searched && (
          <span className="inline-flex items-center gap-1 font-mono text-[9px] tracking-[0.2em] text-primary/70">
            <Globe className="size-3" aria-hidden="true" />
            WEB SEARCH
          </span>
        )}
      </header>
      <p className="whitespace-pre-wrap text-pretty text-sm leading-relaxed text-foreground/90">{message.content}</p>

      {message.sources?.length > 0 && (
        <div className="mt-3">
          <p className="mb-1.5 font-mono text-[9px] tracking-[0.25em] text-muted-foreground">WEB SOURCES</p>
          <ul className="flex flex-col gap-1">
            {message.sources.map((source, index) => (
              <li key={`${source.url}-${index}`}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-start gap-2 rounded-sm px-1.5 py-1 text-xs transition-colors hover:bg-primary/5"
                >
                  <span className="font-mono text-primary/70">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-1 text-foreground/85 group-hover:text-primary">{source.title}</span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">
                      {hostnameOf(source.url)}
                    </span>
                  </span>
                  <ArrowUpRight className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="sr-only">(opens in a new tab)</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  )
}
