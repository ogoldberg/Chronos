# CHRONOS — Feature Backlog

Priority: P0 (do now) → P1 (next) → P2 (soon) → P3 (later)
Status: [ ] todo, [~] in progress, [x] done

---

## P0 — Critical Path

### [~] Full two-way voice conversation
Real-time voice input and output — talk to CHRONOS like a person. "Tell me about the Silk Road" → timeline animates, globe rotates, voice narrates.
- [ ] Voice input via Web Speech Recognition API (browser-native STT)
- [ ] Streaming TTS for AI responses (replace current utterance-based approach)
- [ ] Push-to-talk and hands-free modes
- [ ] Voice activity detection (VAD) for natural conversation flow
- [ ] Visual waveform/indicator showing listening/speaking state
- [ ] Interrupt support — user can speak while AI is talking to redirect

### [ ] Streaming AI responses
Chat and discovery currently wait for the full response before displaying.
- [ ] Add `chatStream()` to AIProvider interface
- [ ] Implement for Anthropic (SSE), OpenAI (SSE), Google (streaming)
- [ ] Token-by-token rendering in ChatPanel
- [ ] Parse [[GOTO]], [[TOUR]], [[EVENTS]] tags as they stream in
- [ ] Streaming for discovery responses (events appear one by one)

### [ ] Event connections and causality
History is a web, not a list. Show cause → effect chains.
- [ ] Add `connections` field to TimelineEvent: `{targetId, type: 'caused'|'influenced'|'preceded'|'related', label}`
- [ ] Render connection arcs on the timeline canvas between linked events
- [ ] AI guide automatically suggests connections when adding events
- [ ] "Why did this happen?" button on event cards traces the causal chain
- [ ] DB schema: `event_connections` table with indexes

### [ ] "What else was happening?" — Parallel civilization lanes
The killer differentiator. Split timeline into geographic lanes showing simultaneous events.
- [ ] Lane system: each row = a region (Europe, East Asia, Americas, Africa, Middle East, South Asia)
- [ ] Toggle between single-lane and multi-lane view
- [ ] AI generates contemporary events for other regions when you focus on one
- [ ] Visual: horizontal bands with region labels, events stacked per-region
- [ ] "Compare eras" mode: pick two civilizations, see them side by side

---

## P1 — High Impact

### [ ] Shareable deep links
Encode viewport + selected event in the URL for sharing.
- [ ] URL format: `/timeline?y=1776&s=50&event=a-independence`
- [ ] Update URL on navigation (replaceState, not pushState spam)
- [ ] Open shared links to exact viewport position
- [ ] OG meta tags for social previews (event title, description, image)
- [ ] "Share this view" button with copy-to-clipboard

### [ ] Event clustering
Dense AI-generated events overlap at certain zoom levels.
- [ ] Spatial clustering algorithm (grid-based or DBSCAN)
- [ ] Cluster markers: "8 events" bubble with count
- [ ] Click cluster to expand into sub-view or zoom in
- [ ] Smooth animation between clustered and expanded states
- [ ] Cluster by category option (show all wars, all science, etc.)

### [ ] Real Earth on the globe
Replace wireframe with actual land masses.
- [ ] Option A: Earth texture map (simple, ~2MB)
- [ ] Option B: GeoJSON coastlines rendered as Three.js lines (lighter, stylized)
- [ ] Day/night shading based on the year being viewed (artistic, not literal)
- [ ] Simplified political borders for major empires (GeoJSON)
- [ ] Terrain elevation (subtle, for mountain ranges and ocean depth)

### [ ] Code splitting and performance
Three.js is 500KB+ in the main bundle.
- [ ] Lazy-load GlobePanel with React.lazy + Suspense
- [ ] Lazy-load ChatPanel (not needed on first paint)
- [ ] Preload Three.js after initial timeline render
- [ ] Web Worker for event discovery fetching
- [ ] Virtual rendering for events (only render visible ones on canvas)

### [ ] Animated border changes on globe
Show empires rise and fall as you scrub through time.
- [ ] Curated GeoJSON for major empires at key dates (Roman, Mongol, Ottoman, British, etc.)
- [ ] AI generates simplified border polygons for discovered territorial events
- [ ] Morph animation between border states as timeline moves
- [ ] Color-coded by civilization/empire
- [ ] Toggle overlay on/off

---

## P2 — Important

### [ ] User accounts and annotations
Transform from viewer to tool.
- [ ] Auth (OAuth with Google/GitHub, or magic link)
- [ ] Personal bookmarks and notes on events
- [ ] Custom events ("My family arrived in America in 1923")
- [ ] Save and name timeline views
- [ ] User event collections ("My History 101 study guide")

### [ ] Keyboard navigation and accessibility
- [ ] Arrow keys: left/right to pan, up/down to zoom
- [ ] Tab between visible events, Enter to select
- [ ] Escape to close panels/cards
- [ ] Screen reader announcements for timeline position and events
- [ ] High contrast mode
- [ ] Reduced motion mode (disable animations)

### [ ] Primary source documents
Link events to actual historical documents.
- [ ] Wikisource API integration for public domain texts
- [ ] "Read the source" button on event cards
- [ ] Inline document viewer with AI-generated summary
- [ ] Archive.org integration for images and media

### [ ] AI fact-checking pipeline
Cross-reference discovered events before showing them.
- [ ] Verify against Wikidata structured data (dates, locations)
- [ ] Confidence score on each discovered event
- [ ] Visual indicator: verified vs. unverified
- [ ] Community voting (upvote/downvote) on event accuracy
- [ ] Flag system for incorrect events

### [ ] Offline / PWA
- [ ] Service worker caching app shell
- [ ] Cache discovered events from localStorage for offline browsing
- [ ] "Download era" — pre-fetch and cache a time period
- [ ] Sync user annotations when back online
- [ ] Install as native app (manifest.json)

---

## P3 — Future

### [ ] Classroom / presentation mode
- [ ] Full-screen tour playback, no UI chrome
- [ ] Larger text, high contrast for projectors
- [ ] Teacher controls: pause, annotate, quiz
- [ ] Student view: follow along, take notes
- [ ] Export tour as video or slide deck

### [ ] Comparison view
- [ ] Pick 2-4 civilizations or topics
- [ ] Synchronized side-by-side timelines
- [ ] Shared time axis, independent vertical lanes
- [ ] AI narrates the comparison: "While Europe was in the Dark Ages, the Islamic Golden Age was..."

### [ ] Collaborative editing
- [ ] Real-time multi-user cursors (like Figma)
- [ ] Shared annotations and discussions on events
- [ ] "Suggest an edit" workflow for community contributions
- [ ] Moderation queue for public contributions

### [ ] Historical weather and climate overlay
- [ ] Climate data visualization on globe (ice ages, volcanic winters)
- [ ] Overlay toggle: temperature, sea levels, CO2
- [ ] Connect climate events to historical consequences

### [ ] Economic and demographic data
- [ ] Population graphs per civilization
- [ ] Trade volume on Silk Road / maritime routes
- [ ] GDP estimates for historical empires
- [ ] Overlay as heat maps or charts alongside the timeline

### [ ] AR/VR mode
- [ ] WebXR support for immersive timeline exploration
- [ ] Walk through history in VR, events floating around you
- [ ] AR overlay on a physical globe

---

## Completed

### [x] Core timeline with zoom/pan
### [x] 60+ curated anchor events
### [x] Unlimited AI event discovery (15 zoom tiers)
### [x] 3-layer caching (memory + localStorage + server)
### [x] 3D globe with markers, paths, battles
### [x] AI chat guide with context awareness
### [x] Animated guided tours with TTS voice
### [x] Chat-to-timeline event persistence
### [x] Wikipedia integration
### [x] PostgreSQL persistence
### [x] Model-agnostic providers (4 backends)
### [x] Production server + Docker + Railway deploy
### [x] Sub-year time precision
### [x] Multimedia fields (image, video, audio)
### [x] Geographic coordinates on events
### [x] Full two-way voice conversation (STT + TTS)
### [x] Streaming AI responses (SSE, all 4 providers)
### [x] Event connections and causality (arcs + arrows)
### [x] Parallel civilization lanes ("What else was happening?")
### [x] Shareable deep links (URL state)
### [x] Code splitting (main bundle 760KB → 242KB)
### [x] Event clustering (grid-based, 3+ threshold)
### [x] Keyboard navigation + help overlay
### [x] PWA / offline support (service worker + manifest)
### [x] Primary source documents (Wikisource API)
### [x] Rate limiting on AI endpoints
### [x] Security: admin key for config, JSON parse safety, lat/lng coercion fix
### [x] Production Dockerfile with health check + pruned deps
