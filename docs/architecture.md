# CHRONOS — Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                             │
│  ┌──────────┐  ┌──────────┐  ┌────────┐  ┌───────────┐ │
│  │ Timeline │  │  Globe   │  │  Chat  │  │   Tour    │ │
│  │  Canvas  │  │ Three.js │  │ Panel  │  │  Overlay  │ │
│  └────┬─────┘  └────┬─────┘  └───┬────┘  └─────┬─────┘ │
│       │              │            │              │       │
│  ┌────┴──────────────┴────────────┴──────────────┴────┐ │
│  │              App State (React)                      │ │
│  │  viewport, events, selectedEvent, chat, tour        │ │
│  └────────────────────────┬───────────────────────────┘ │
│                           │                              │
│  ┌────────────────────────┴───────────────────────────┐ │
│  │          Event Discovery Engine                     │ │
│  │  Grid cells → fetch queue → memory + localStorage   │ │
│  └────────────────────────┬───────────────────────────┘ │
│                           │                              │
│            fetch /api/*   │   Wikipedia REST API         │
└───────────────────────────┼──────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────┐
│                      Server                              │
│  ┌────────────────────────┴───────────────────────────┐ │
│  │              API Routes (Express)                   │ │
│  │  /api/discover  /api/chat  /api/insights  /api/config│
│  └────────┬───────────────────────────┬───────────────┘ │
│           │                           │                  │
│  ┌────────┴────────┐       ┌─────────┴──────────┐      │
│  │   AI Provider   │       │    PostgreSQL       │      │
│  │  ┌───────────┐  │       │  events table       │      │
│  │  │ Anthropic │  │       │  full-text search   │      │
│  │  │ OpenAI    │  │       │  geo indexes        │      │
│  │  │ Google    │  │       │  (optional)         │      │
│  │  │ Ollama    │  │       └────────────────────┘      │
│  │  └───────────┘  │                                    │
│  └─────────────────┘                                    │
└─────────────────────────────────────────────────────────┘
```

## Directory Structure

```
Chronos/
├── docs/                     # Product docs (you are here)
│   ├── vision.md
│   ├── backlog.md
│   └── architecture.md
│
├── server/                   # Node.js backend
│   ├── api.ts                # Route handlers (shared dev/prod)
│   ├── db.ts                 # PostgreSQL schema + queries
│   ├── production.ts         # Express production server
│   ├── prompts.ts            # All AI system prompts
│   └── providers/            # Model-agnostic AI layer
│       ├── types.ts          # AIProvider interface
│       ├── index.ts          # Factory + runtime switching
│       ├── anthropic.ts      # Claude (web search support)
│       ├── openai.ts         # GPT-4o (web search via Responses API)
│       ├── google.ts         # Gemini
│       └── ollama.ts         # Local models
│
├── src/                      # React frontend
│   ├── App.tsx               # Main app shell + state
│   ├── App.css               # Global styles
│   ├── types.ts              # Shared TypeScript types
│   │
│   ├── canvas/               # Timeline rendering
│   │   ├── TimelineCanvas.tsx # React wrapper, input handlers
│   │   ├── renderer.ts       # Canvas draw functions
│   │   └── viewport.ts       # Zoom/pan math
│   │
│   ├── components/           # UI overlays
│   │   ├── ChatPanel.tsx     # AI conversation guide
│   │   ├── EraChips.tsx      # Quick-nav era buttons
│   │   ├── EventCard.tsx     # Event detail popup
│   │   ├── GlobePanel.tsx    # 3D Earth (Three.js)
│   │   ├── InsightsPanel.tsx # AI facts about current view
│   │   └── TourOverlay.tsx   # Guided tour controls
│   │
│   ├── data/                 # Static data
│   │   ├── anchorEvents.ts   # 60+ curated events
│   │   └── eras.ts           # Era definitions
│   │
│   ├── services/             # API clients
│   │   ├── eventDiscovery.ts # Grid-based discovery engine
│   │   └── wikipediaApi.ts   # Wikipedia REST API
│   │
│   └── utils/                # Helpers
│       ├── format.ts         # Year/time formatting
│       └── speech.ts         # Web Speech API (TTS)
│
├── Dockerfile                # Production container
├── railway.toml              # Railway deploy config
├── vite.config.ts            # Vite + API plugin
└── package.json
```

## Key Design Decisions

### Linear viewport (not logarithmic)
The timeline uses `centerYear + span` rather than a log scale. This is simpler and works because the progressive disclosure system (maxSpan thresholds) naturally handles the scale problem — cosmic events only show at wide zoom, daily events only at tight zoom.

### Canvas for timeline, React for UI
The timeline renders at 60fps on a `<canvas>` element. Interactive overlays (chat, event cards, tour controls) are standard React components absolutely positioned over the canvas. This gives us smooth rendering without React re-render overhead on every frame.

### Grid-based discovery
The timeline is divided into cells at each zoom tier. Each cell is fetched exactly once and cached permanently. This prevents duplicate requests, enables prefetching, and makes the cache key simple: `tierId:cellIndex`.

### Provider abstraction
The `AIProvider` interface has a single method: `chat(system, messages, options) → { text }`. All provider-specific complexity (tool use, streaming format, auth) is hidden behind this interface. Adding a new provider is one file.

### Optional database
PostgreSQL is used for persistence but the app works perfectly without it. The in-memory + localStorage cache handles the common case. Postgres adds: persistence across deploys, full-text search, geographic queries, and multi-instance support.
