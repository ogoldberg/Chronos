# CHRONOS — Infinite Zoomable Timeline of Existence

An interactive, AI-powered timeline spanning from the Big Bang (13.8 billion years ago) to the present day. Zoom from cosmic epochs to individual historical moments, with AI-generated events, Wikipedia integration, and a conversational history guide.

## Features

- **Infinite Zoom** — Scroll from the Big Bang to 2025. The deeper you zoom, the more events appear.
- **60+ Curated Anchor Events** — Hand-picked milestones across cosmic, geological, evolutionary, and human history.
- **AI Event Discovery** — As you zoom into any era, Claude generates historically verified events for that time window, grounded via web search.
- **Wikipedia Integration** — Click any event for images, summaries, and article links from Wikipedia's REST API.
- **AI History Guide** — Chat with a context-aware AI that knows what you're looking at on the timeline, adapts from child-friendly to PhD-level depth, and can navigate the timeline to illustrate its explanations.
- **Guided Tours** — Ask the guide for a tour ("walk me through the fall of Rome") and watch the timeline animate between stops with narration.
- **Voice Narration** — Toggle voice to hear the guide speak using the Web Speech API.
- **Touch Support** — Pinch-to-zoom and drag on mobile devices.
- **Quick Navigation** — Era chips for jumping between Big Bang, Earth, Life, Dinosaurs, Civilization, and Modern eras.

## Getting Started

### Prerequisites

- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)

### Setup

```bash
# Clone the repo
git clone https://github.com/ogoldberg/chronos.git
cd chronos

# Install dependencies
npm install

# Set your API key
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY

# Start development server
npm run dev
```

Open `http://localhost:5173` in your browser.

### Controls

| Action | Desktop | Mobile |
|--------|---------|--------|
| Zoom | Scroll wheel | Pinch |
| Pan | Click + drag | Touch + drag |
| Select event | Click | Tap |
| Open guide | Click 💬 button | Tap 💬 button |
| Toggle voice | Click 🔇/🔊 button | Tap 🔇/🔊 button |

## Architecture

```
src/
├── canvas/           # Canvas rendering & viewport math
│   ├── TimelineCanvas.tsx
│   ├── renderer.ts
│   └── viewport.ts
├── components/       # React UI overlays
│   ├── ChatPanel.tsx
│   ├── EraChips.tsx
│   ├── EventCard.tsx
│   ├── InsightsPanel.tsx
│   └── TourOverlay.tsx
├── data/             # Curated events & era definitions
├── services/         # Wikipedia API client
├── utils/            # Formatting, speech helpers
└── App.tsx           # Main app shell
server/
└── api.ts            # Vite middleware: Claude API proxy
```

### Key Design Decisions

- **Canvas for timeline, React for UI** — The timeline renders at 60fps on canvas. Interactive overlays (chat, cards, tours) are React components.
- **Server-side API proxy** — Claude API calls go through a Vite dev server middleware to keep the API key secure.
- **Linear viewport model** — `centerYear + span` defines the visible window. Zoom adjusts span while keeping the cursor position fixed.
- **Progressive disclosure** — Events have a `maxSpan` threshold. Cosmic events show at any zoom; individual events only appear when zoomed in enough.

## Tech Stack

- React 19 + TypeScript
- Vite 8
- Anthropic Claude API (with web search tool)
- Wikipedia REST API
- Web Speech API (browser-native TTS)
- HTML5 Canvas

## License

MIT
