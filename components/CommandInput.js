'use client'

import { useState } from 'react'
import { CornerDownLeft } from 'lucide-react'

export default function CommandInput({ busy, onSubmit }) {
  const [value, setValue] = useState('')

  const handleSubmit = (event) => {
    event.preventDefault()
    const text = value.trim()
    if (!text || busy) return
    onSubmit(text)
    setValue('')
  }

  return (
    <form onSubmit={handleSubmit} className="border-t border-border p-3">
      <label htmlFor="jarvis-command" className="sr-only">
        Type a command for JARVIS
      </label>
      <div className="flex items-center gap-2 rounded-md border border-input bg-background/60 px-3 focus-within:border-primary/60">
        <span className="font-mono text-xs text-primary" aria-hidden="true">
          {'>'}
        </span>
        <input
          id="jarvis-command"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="Type a command…"
          autoComplete="off"
          maxLength={2000}
          className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          disabled={!value.trim() || busy}
          className="inline-flex size-8 items-center justify-center rounded-sm text-primary transition-colors hover:bg-primary/10 disabled:text-muted-foreground/40 disabled:hover:bg-transparent"
        >
          <CornerDownLeft className="size-4" aria-hidden="true" />
          <span className="sr-only">Send</span>
        </button>
      </div>
    </form>
  )
}
