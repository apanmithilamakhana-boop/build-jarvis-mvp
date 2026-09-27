# J.A.R.V.I.S. — AI Voice Assistant (MVP)

A voice-first assistant: **Web Speech API** (ears) → **Ollama** (brain) → **Search API** (live web) → **ElevenLabs** (voice).

```
IDLE → "Jarvis" → LISTENING → THINKING → (SEARCHING → THINKING) → SPEAKING → IDLE
```

## 1. Requirements

- Node.js 20+
- Ollama
- A Search API key (SearchApi.io, SerpApi, Serper, Brave, Tavily or Google CSE)
- An ElevenLabs API key + voice ID
- Chrome or Edge for voice input (Safari works partially, Firefox has no Web Speech recognition)

## 2. Install Node

Download the LTS version from https://nodejs.org, then check:

```bash
node --version
npm --version
```

## 3. Install Ollama

macOS / Windows: download from https://ollama.com/download

Linux:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

## 4. Pull a model

```bash
ollama pull llama3.2
```

Any chat model works (`qwen2.5`, `mistral`, `llama3.1:8b`, ...). Use the same name in `OLLAMA_MODEL`.

## 5. Start Ollama

```bash
ollama serve
```

Keep that terminal open. Check it works:

```bash
curl http://localhost:11434/api/tags
```

## 6. Install dependencies

```bash
npm install
```

## 7. Create `.env.local`

Create a file named `.env.local` in the project root:

```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

SEARCH_API_KEY=your_search_api_key
SEARCH_API_URL=https://www.searchapi.io/api/v1/search

ELEVENLABS_API_KEY=your_elevenlabs_api_key
ELEVENLABS_VOICE_ID=your_voice_id
```

Optional:

```env
# eleven_flash_v2_5 (default, fastest), eleven_multilingual_v2, eleven_v3
ELEVENLABS_MODEL_ID=eleven_flash_v2_5
# Only for hosted Ollama (https://ollama.com) or a protected proxy
OLLAMA_API_KEY=
```

Keys are only read by server routes in `app/api/*`. Never prefix them with `NEXT_PUBLIC_`.

## 8. Configure the Search API

Set `SEARCH_API_URL` to your provider's endpoint — the provider is detected automatically:

| Provider     | SEARCH_API_URL                                             |
| ------------ | ---------------------------------------------------------- |
| SearchApi.io | `https://www.searchapi.io/api/v1/search`                   |
| SerpApi      | `https://serpapi.com/search.json`                          |
| Serper       | `https://google.serper.dev/search`                         |
| Brave        | `https://api.search.brave.com/res/v1/web/search`           |
| Tavily       | `https://api.tavily.com/search`                            |
| Google CSE   | `https://www.googleapis.com/customsearch/v1?cx=YOUR_CX_ID` |

For any other provider, edit `buildProviderRequest()` in `lib/search.js` (marked **PROVIDER-SPECIFIC REQUEST — ADAPT HERE**).

Test it (with the dev server running):

```bash
curl -X POST http://localhost:3000/api/search -H "Content-Type: application/json" -d '{"query":"latest AI news"}'
```

## 9. Configure ElevenLabs

1. Create an API key at https://elevenlabs.io/app/settings/api-keys (needs the Text to Speech permission).
2. Pick a voice at https://elevenlabs.io/app/voice-library, open it and copy its **Voice ID**.
3. Put both in `.env.local`.

Test it:

```bash
curl -X POST http://localhost:3000/api/speak -H "Content-Type: application/json" -d '{"text":"Systems online."}' --output test.mp3
```

## 10. Run the app

```bash
npm run dev
```

Open http://localhost:3000

- **Wake word:** click **WAKE WORD ON**, then say "Jarvis, what's the latest AI news?" or just "Jarvis" and then your request.
- **Push to talk:** click the microphone button.
- **Text:** type in the box and press Enter — same pipeline.
- Saying "Jarvis" (or clicking the mic) while it's speaking interrupts it.

## 11. Browser microphone permissions

- Use **Chrome** or **Edge**. Browser speech recognition sends audio to the browser vendor's speech service, so it needs internet.
- `localhost` counts as secure; any other host must be served over **HTTPS**.
- If you denied access: click the lock/tune icon in the address bar → Site settings → Microphone → Allow, then reload.
- If the app is embedded in an iframe (e.g. a preview panel), open it in its own tab.

## 12. Troubleshooting Ollama

"JARVIS CORE OFFLINE" or "AI: OLLAMA OFFLINE":

```bash
ollama serve                         # is it running?
curl http://localhost:11434/api/tags # does it answer?
ollama list                          # is OLLAMA_MODEL installed?
ollama pull llama3.2                 # install it
```

- "MODEL MISSING" in the HUD means `OLLAMA_MODEL` doesn't match anything in `ollama list`.
- The first reply can be slow while the model loads into memory.
- If the app is deployed (not on your machine), `localhost` points at the server, not your computer. Expose Ollama with a tunnel (e.g. `ngrok http 11434 --host-header="localhost:11434"`) and set `OLLAMA_URL` to the tunnel URL, or use hosted Ollama with `OLLAMA_URL=https://ollama.com` and `OLLAMA_API_KEY`.
- Restart `npm run dev` after editing `.env.local`.

## 13. Troubleshooting voice

- **No speech output / "VOICE SYSTEM UNAVAILABLE":** check `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` and your ElevenLabs credit balance; run the curl test above and read the terminal log.
- **"AUDIO BLOCKED":** browsers only allow audio after a user interaction. Click anywhere (or the mic) once.
- **Mic does nothing / "SPEECH SERVICE UNAVAILABLE":** use Chrome/Edge, make sure you're online, and allow mic access.
- **Wake word not detected:** speak clearly; the recognizer sometimes hears "Jervis" (accepted). To swap in Porcupine, call `startListening()` from its detection callback in `lib/speech.js`.

## 14. Troubleshooting search

- **"WEB SEARCH UNAVAILABLE" / "SEARCH: OFFLINE":** `SEARCH_API_URL` or `SEARCH_API_KEY` is missing or wrong. Run the curl test above; the terminal shows the provider's error.
- **Search never triggers:** it only runs for current-information questions (news, weather, prices, "latest", "today", "search for..."). Rules live in `lib/intent.js`.
- **Wrong/empty results:** your provider may use a different response shape — adjust `normalizeResults()` in `lib/search.js`.

## Project structure

```
app/
  page.js                 # renders the JARVIS app
  api/chat/route.js       # POST: Ollama (+ search context) · GET: system status
  api/search/route.js     # POST: web search
  api/speak/route.js      # POST: ElevenLabs TTS → audio/mpeg
components/
  JarvisApp.js            # state machine + voice/text pipeline
  JarvisCore.js           # animated CSS orb
  VoiceWave.js            # reactive waveform
  ChatHistory.js          # conversation + web sources
  StatusDisplay.js        # state readout + system info
  CommandInput.js         # text fallback
lib/
  ollama.js  search.js  elevenlabs.js   # server-only service clients
  speech.js                             # speech recognition + wake word
  intent.js                             # search decision + text helpers
```
