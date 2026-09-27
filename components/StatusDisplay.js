import { Globe } from 'lucide-react'
import { cn } from '@/lib/utils'

const STATES = ['IDLE', 'LISTENING', 'THINKING', 'SEARCHING', 'SPEAKING']

function describe(status, wakeArmed) {
  switch (status) {
    case 'LISTENING':
      return 'Listening — speak your request'
    case 'THINKING':
      return 'Processing request'
    case 'SEARCHING':
      return 'Querying live web sources'
    case 'SPEAKING':
      return 'Transmitting voice response'
    default:
      return wakeArmed ? 'Wake word armed — say "Jarvis"' : 'Tap the microphone or type a command'
  }
}

export default function StatusDisplay({ status, wakeArmed }) {
  return (
    <div className="flex flex-col items-center gap-3 text-center" role="status" aria-live="polite">
      <div className="flex items-center gap-3">
        <p className="font-mono text-xl font-medium tracking-[0.45em] text-primary md:text-2xl">{status}</p>
        {status === 'SEARCHING' && (
          <span className="inline-flex items-center gap-1.5 rounded-sm border border-primary/40 bg-primary/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.2em] text-primary">
            <Globe className="size-3 animate-spin [animation-duration:3s]" aria-hidden="true" />
            WEB SEARCH
          </span>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{describe(status, wakeArmed)}</p>
      <ol className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2" aria-label="Assistant states">
        {STATES.map((state) => (
          <li
            key={state}
            aria-current={state === status ? 'step' : undefined}
            className={cn(
              'flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] transition-colors',
              state === status ? 'text-primary' : 'text-muted-foreground/50',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                state === status ? 'bg-primary shadow-[0_0_8px_var(--primary)]' : 'bg-muted-foreground/30',
              )}
            />
            {state}
          </li>
        ))}
      </ol>
    </div>
  )
}

function Indicator({ label, value, state }) {
  return (
    <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.18em]">
      <span
        className={cn(
          'size-1.5 rounded-full',
          state === 'online' && 'bg-primary shadow-[0_0_6px_var(--primary)]',
          state === 'offline' && 'bg-destructive',
          state === 'pending' && 'animate-pulse bg-muted-foreground',
        )}
        aria-hidden="true"
      />
      <span className="text-muted-foreground">{label}:</span>
      <span className={state === 'offline' ? 'text-destructive' : 'text-foreground'}>{value}</span>
    </div>
  )
}

/** Small subsystem readout: AI / VOICE / SEARCH / SYSTEM. */
export function SystemInfo({ data, isLoading }) {
  const pending = isLoading && !data
  const ollamaOnline = data?.ollama?.online
  const modelNote = data?.ollama?.online && !data.ollama.modelInstalled ? ' (MODEL MISSING)' : ''

  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2" aria-label="System status">
      <Indicator
        label="AI"
        value={pending ? 'OLLAMA' : ollamaOnline ? `OLLAMA ONLINE${modelNote}` : 'CLOUD FALLBACK'}
        state={pending ? 'pending' : 'online'}
      />
      <Indicator
        label="VOICE"
        value={pending ? 'ELEVENLABS' : data?.voice?.configured ? 'ELEVENLABS' : 'NOT CONFIGURED'}
        state={pending ? 'pending' : data?.voice?.configured ? 'online' : 'offline'}
      />
      <Indicator
        label="SEARCH"
        value={pending ? 'CHECKING' : data?.search?.configured ? 'ONLINE' : 'OFFLINE'}
        state={pending ? 'pending' : data?.search?.configured ? 'online' : 'offline'}
      />
      <Indicator label="SYSTEM" value="ONLINE" state="online" />
    </div>
  )
}
