# Chronos Redesign — April 2026

## Why

The app packs great functionality — infinite-zoom timeline, AI guide, paleogeographic globe, period/region/event explanations — but the UI drowns it in chrome. A single screen shows:

- 11 era chips wrapping into 2 rows
- 27 feature buttons in a bottom toolbar
- 4 separate top-right widgets (discover badge, zoom badge, cache badge, voice)
- An overlapping globe panel
- An AI insights panel
- An XP badge

The timeline itself gets ~25% of the viewport and nothing signals it is the main thing. Every element competes for the same weight; there's no visual hierarchy. The design language is dark-chrome + rounded pills + emoji icons — the house style of every SaaS dashboard shipped in 2024, with no connection to the actual subject matter (deep time, cosmic scale, historical archive).

This document captures the redesign plan and tracks what shipped.

## Design direction: Chrono-Editorial

Treat the app like a living cosmic almanac: cold, precise, a little archival, a little scientific instrument. Not dark-mode-SaaS.

**Typography**
- **Display**: Fraunces (high-contrast variable serif — the app's voice)
- **UI/body**: General Sans (humanist sans with character, not Inter)
- **Data/mono**: JetBrains Mono (years, coordinates, ruler ticks)

Type size carries hierarchy: scale labels like "COSMIC" / "ANCIENT" set BIG in the display serif become navigation landmarks rather than 10px all-caps gray text.

**Color**
- Background: deep midnight ink `#0a0e1a` (slightly warmer than pure black)
- Foreground: warm cream `#f4ecd8` (not `#fff` — reads as paper)
- Accent: amber / ember `#e8a94b` for interaction, highlights, active states
- One dominant + one accent. Era colors kept on the timeline band but muted ~30%.

**Spatial**
- 1px hairlines (`rgba(244,236,216,0.1)`) instead of rounded cards with 1px borders everywhere
- Generous negative space
- Asymmetric layout: date/era indicator large and left-leaning; timeline ruler becomes the spine
- Squared corners with hairlines — no rounded pills

**Motion**
- One moment of drama on load: staggered reveal of header → canvas → hint text
- Smooth ease-out for zoom; no bounce
- Calm micro-interactions elsewhere

## The five changes

### 1. Editorial header + ⌘K command palette

Delete the 11 era chips and 27 toolbar buttons. Replace with:

- A thin editorial header: `CHRONOS          Cenozoic · 2026.26 CE          ⌘K`
  - Left: wordmark in Fraunces
  - Center: current era + formatted year — typographic, clickable; opens the date picker
  - Right: `⌘K` hint that triggers the command palette
- A `⌘K` command palette (Raycast-style) that holds the ~20 features the toolbar currently exposes. Keyboard-first, searchable, zero visual clutter.

Primary actions that stay visible in the header (not the palette):
- **Ask** — opens chat drawer (but chat drawer is also persistent, so this is for discovery)
- **Jump** — opens date picker
- Everything else is palette-only.

Why: 27 buttons in a row is feature vomit. A palette scales to any number of features and is discoverable by typing.

### 2. Typography + color refresh

Add fonts via Fontsource (Fraunces, General Sans, JetBrains Mono). Add CSS variables for the new palette. Update the 5–6 components that use hardcoded dark-chrome colors so they pick up the tokens.

### 3. Full-bleed canvas + chat as a right drawer

Canvas takes the entire viewport. The header floats over the top in a thin strip. Chat becomes a persistent (but collapsible) right drawer — narrow, serif header, markdown rendered. When the user clicks an event or region, the drawer slides in pre-loaded with a question if the user chooses to ask the guide.

Delete the bottom toolbar row. Delete the floating globe-panel-in-top-right overlap.

Globe becomes: a collapsible panel in the top-right corner below the header, OR a ⌘K → "Show globe" command that opens it full-screen. Default collapsed.

### 4. Timeline ruler redesign

The ruler is currently a thin horizontal line with tiny gray tick labels. In the new design it becomes the spine of the app:

- Big serif era markers above the main timeline axis (e.g. `JURASSIC`, `MEDIEVAL`) in muted Fraunces, positioned along the ruler at era transitions.
- Small mono tick years in JetBrains Mono below.
- Events above the ruler get more room to breathe.

### 5. Era color muting + lane re-theming

The era colors are too saturated. Multiply them down to ~60% saturation and darken ~30% so they sit behind type instead of competing with it. The background tint for each era also gets muted so the user can see the era change but the canvas doesn't look like a rainbow.

Lane toggle (region comparison) bands are re-themed to match the new palette — cream foreground, dark backgrounds, thin hairlines, no pill shapes.

## Scope: what stays, what goes

### Removed from main surface (available via ⌘K palette)

Parallels, Myths, Quiz, Lenses, Classroom, Teach, My Life, What If, Time-lapse, Debate, Community, Collab, Data overlays, Export, Today, Graph, Review, Figures, Reading, Sources, Places, Sound, Difficulty, Account.

All wiring stays intact; only the visual entry points move. If any of those features are duplicates of each other, they can be consolidated in a follow-up pass — not part of this redesign.

### Deleted outright

- Cache badge ("3 regions · 92 events") — nobody needs this
- Discovering badge — silent on failure instead of a pulsing forever-indicator
- Bottom toolbar row entirely
- Era chip row (replaced by date picker + command palette)
- Voice button top-right (moves into chat header — it's chat-specific)

### Kept

- The timeline canvas and all its interactions (pan, zoom, click, period-click)
- The globe (collapsed by default; expand via header button)
- The AI chat (now a persistent drawer)
- The date picker (now opened by clicking the era/year text in the header)
- The region click-to-explain feature on the globe

## Implementation order

1. Docs (this file) + todos
2. Fonts — add Fraunces / General Sans / JetBrains Mono
3. Design tokens — CSS variables for color, type, borders
4. Editorial header + command palette component
5. Delete era chips + toolbar, wire palette into existing panels
6. Canvas full-bleed + chat drawer
7. Timeline ruler typography pass
8. Era color mute + hairline borders pass
9. Verify in browser

Each step reloads cleanly so we can check progress. The biggest wins are steps 2–5 (fonts + header + palette) — that alone should make the app feel two years newer.
