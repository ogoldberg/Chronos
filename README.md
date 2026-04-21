# Chronos

**An infinite zoomable timeline of everything — from the Big Bang to today.**

Zoom from cosmic epochs (13.8 billion years ago) down to individual days,
weave events through thematic threads, explore the knowledge graph of how
history connects, and — optionally — bring your own AI key for
conversational features.

Live at [chronosapp.org](https://chronosapp.org).

---

## What's in the box

- **Infinite zoom** — one viewport, from the formation of the universe to
  this morning's headlines. Events reveal themselves as you zoom.
- **Event discovery that doesn't hallucinate** — Wikidata's SPARQL graph
  supplies real, dated events across nine themed categories (science,
  literature, art, politics, disasters, inventions, sport & culture,
  revolutions, warfare) with weighted quotas so no single theme dominates.
- **Knowledge graph visualization** — click any well-documented event and
  see its causes, effects, sub-events, and siblings as an interactive
  force-directed graph. Sourced from Wikidata properties (P828, P1542,
  P361, P155/P156, P585/P580/P577). Relations are labeled specifically
  ("Part of: Seventh Russo-Turkish War", not "related event").
- **Thematic timelines (parallel threads)** — overlay multiple themed
  tracks, see where they converge, and ask the app to validate
  convergences you hypothesize yourself.
- **Today in History** — Wikipedia's "On This Day" data, enriched with
  Wikidata coordinates and categories. Free, no AI required.
- **Globe view** — click any region × year to see what was happening
  there.
- **Optional AI features** — chat with a history guide, generate
  counterfactuals, chat with historical figures, fact-check events,
  discover primary sources, compare perspectives, generate quizzes,
  classroom curricula, and more. All AI calls run **directly in your
  browser** against your chosen provider (Anthropic, OpenAI, Google
  Gemini, or a local Ollama). The Chronos server is never in the AI
  path — your key and messages never touch our infrastructure.

## Zero-trust AI

Every AI request is a direct HTTPS call from the browser tab to the
provider's API. There is no proxy. There is no server-side logging.
Open your devtools Network tab while using any AI feature and you'll
see requests to `api.anthropic.com` / `api.openai.com` /
`generativelanguage.googleapis.com` — never to our domain.

This is enforced by architecture, not policy. The server has no AI
endpoint — there is literally nothing server-side that could receive
or log an API key. You can read the short `server/api/index.ts` to
confirm.

You configure your key via the in-app Settings panel. It's stored in
localStorage and never leaves this browser.

## Running locally

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ (optional — features degrade gracefully when absent)

### Setup

```bash
git clone https://github.com/ogoldberg/chronos.git
cd chronos
npm install

# Optional: copy the env template if you want auth / persistent caching
cp .env.example .env

npm run dev
```

The dev server runs at `http://localhost:5173`.

To use AI features: open the app, press ⌘K → "AI settings", and paste
your own API key from
[Anthropic](https://console.anthropic.com/settings/keys),
[OpenAI](https://platform.openai.com/api-keys), or
[Google AI Studio](https://aistudio.google.com/apikey).

No API key is needed to use the timeline itself — Wikipedia + Wikidata
power the free tier.

### Production build

```bash
npm run build
npm start
```

Serves the static bundle + the free API (Wikipedia/Wikidata proxy,
event cache, optional auth) from a single Node process.

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│  BROWSER                                                      │
│                                                               │
│  ┌──────────────┐     ┌────────────────┐                      │
│  │ Chronos UI   │────>│ Your AI key    │                      │
│  │ (Vite+React) │     │ in localStorage│                      │
│  └───────┬──────┘     └────────────────┘                      │
│          │                                                    │
│          │  AI requests (direct, HTTPS)                       │
└──────────┼────────────────────────────────────────────────────┘
           │
           ▼
   ┌────────────────────┐
   │ api.anthropic.com  │   (or api.openai.com,
   │ + provider         │    generativelanguage.googleapis.com,
   │                    │    or your local Ollama)
   └────────────────────┘

┌───────────────────────────────────────────────────────────────┐
│  BROWSER ──────> CHRONOS SERVER ──────> Wikipedia / Wikidata  │
│           (free data only — no keys, no AI)                   │
└───────────────────────────────────────────────────────────────┘
```

Source layout:

```
src/
├── ai/                    # Browser-direct AI provider adapters
│   ├── providers/         # Anthropic, OpenAI, Google, Ollama (lazy-loaded)
│   ├── callAI.ts          # Unified callAI() / streamAI() entry point
│   ├── prompts.ts         # System prompts for every feature
│   └── types.ts
├── features/              # Feature modules (events, chat, today, graph, ...)
├── canvas/                # Timeline rendering + viewport math
├── stores/                # Zustand stores (timeline, UI, AI config)
├── services/              # Wikipedia/Wikidata/fact-check clients
└── components/            # Shared components (command palette, date picker)

server/
├── api/                   # Free endpoints only — no AI routes
│   ├── routes/            # events, discover, today, community, config, ...
│   └── middleware/        # rate limit, validate
├── services/              # onThisDay, wikidataGraph (SPARQL)
└── seed.ts                # Dev-only DB warmer (uses env AI key)
```

## Tech stack

- React 19, TypeScript 5, Vite 8
- Zustand (state), Canvas 2D (timeline rendering)
- PostgreSQL + Better Auth (optional)
- Anthropic / OpenAI / Google Generative AI / Ollama SDKs (client-side)
- Wikipedia REST API + Wikidata SPARQL

## Contributing

Contributions welcome. See [CONTRIBUTING.md](./CONTRIBUTING.md) for
how to set up your dev environment, the conventions the codebase
follows, and how to open a good PR.

Issues, feature requests, and ideas all go in [GitHub Issues][issues].
Please search before filing.

[issues]: https://github.com/ogoldberg/chronos/issues

## Security

If you find a vulnerability, please email `security@chronosapp.org`
instead of opening a public issue. See [SECURITY.md](./SECURITY.md) for
details.

## License

[MIT](./LICENSE) — free to use, modify, and redistribute.
