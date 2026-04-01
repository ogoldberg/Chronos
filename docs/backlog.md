# CHRONOS — Feature Backlog (Updated)

Status: [ ] todo, [~] in progress, [x] done

---

## Not Yet Built

### [ ] Progressive disclosure onboarding
First-time users see too many buttons/panels at once. Need a guided first experience.
- [ ] Welcome screen with "Start exploring" button
- [ ] Tooltip hints that appear sequentially (zoom, pan, click event, open chat)
- [ ] "Show me around" quick tour on first visit
- [ ] Feature discovery: new features highlight on first availability
- [ ] Collapse toolbar to essentials, expand on demand

### [ ] Collaborative editing
Real-time multi-user features.
- [ ] WebSocket server for real-time sync
- [ ] Multi-user cursors on timeline (like Figma)
- [ ] Shared annotations visible to classroom
- [ ] "Suggest an edit" workflow for community events
- [ ] Moderation queue for public contributions
- [ ] Conflict resolution for concurrent edits

### [ ] AI narration of comparison view
The comparison view exists but lacks AI commentary.
- [ ] AI generates "While X was happening in Europe, Y was happening in East Asia..."
- [ ] Audio narration option for comparison mode

### [ ] Per-civilization data overlays
Global data overlays exist (population, CO2, temp, GDP). Need per-civ breakdowns.
- [ ] Population by region/civilization
- [ ] Trade volume on Silk Road / maritime routes
- [ ] GDP estimates per empire (not just global)
- [ ] Heat maps on the globe

### [ ] Export tour as video/slide deck
- [ ] Server-side rendering of tour as video
- [ ] PDF/slide export of timeline segments
- [ ] Animated GIF export of time-lapse

### [ ] AR/VR mode
- [ ] WebXR immersive timeline exploration
- [ ] AR overlay on physical globe

### [ ] More tests
- [ ] API route tests (all 14 endpoints)
- [ ] Store integration tests
- [ ] E2E: full user journeys (Playwright)
- [ ] Discovery engine edge cases
- [ ] Canvas rendering snapshot tests

---

## Completed

### Core
- [x] Canvas timeline with infinite zoom/pan
- [x] 60+ curated anchor events
- [x] Unlimited AI event discovery (15 zoom tiers, DB-first)
- [x] Event clustering (grid-based, 3+ threshold)
- [x] Event connections and causality (arcs + arrows)
- [x] Sub-year time precision (ISO 8601 timestamps)
- [x] Shareable deep links (URL state encoding)
- [x] Keyboard navigation + help overlay (?, arrows, Ctrl+K)

### Globe
- [x] 3D Earth with coastlines (7 continents, ~670 coordinates)
- [x] Event markers, journey arcs, battle markers
- [x] Animated empire border overlays (6 empires)
- [x] Auto-rotate to selected events

### AI
- [x] Model-agnostic providers (Anthropic, OpenAI, Google, Ollama)
- [x] Streaming responses (SSE, all 4 providers)
- [x] AI chat guide with context awareness + tours
- [x] Chat-to-timeline event persistence
- [x] AI fact-checking (Wikidata + Wikipedia cross-reference)
- [x] Citation system (enforced in all prompts, verified URLs)

### Voice
- [x] Two-way conversation (STT + TTS)
- [x] Push-to-talk with silence detection
- [x] Voice narration for tours and responses

### Knowledge
- [x] Knowledge lenses (15 academic + 10 thematic + custom)
- [x] Myth buster (24 curated + AI-generated, card-flip reveal)
- [x] Primary source documents (Wikisource API)
- [x] Wikipedia integration (images, summaries, links)
- [x] "What If?" counterfactual explorer
- [x] Debate mode (two AI perspectives, balanced synthesis)
- [x] Current events → historical parallels

### Education
- [x] Classroom presentation mode (3 preset tours, voice)
- [x] Teacher dashboard + curriculum builder (AI-assisted)
- [x] Student view with progress tracking + join codes
- [x] Gamification (XP, 17 achievements, quizzes, streaks)

### Views
- [x] Parallel civilization lanes (6 regions)
- [x] Comparison view (side-by-side regional timelines)
- [x] Time-lapse auto-scroll
- [x] Climate/economic data overlays (population, CO2, temp, GDP)

### Social
- [x] Community hub (shared lenses, shared tours)
- [x] Event voting (upvote/downvote)
- [x] Personal timeline (life events overlaid on history)

### Infrastructure
- [x] Authentication (Better Auth — email + Google/GitHub OAuth)
- [x] PostgreSQL persistence (schema v2 — 11 tables)
- [x] Zustand state management (4 stores)
- [x] 14 API route modules with Zod validation
- [x] Per-IP rate limiting with configurable endpoint limits
- [x] Code splitting (22 lazy-loaded chunks)
- [x] PWA (service worker + manifest)
- [x] Production server + Dockerfile + Railway config
- [x] DB warming script (npm run seed)
- [x] Vitest (37 unit tests) + Playwright E2E setup
- [x] src/features/ domain module architecture
- [x] DB-first discovery (cache_regions table)
- [x] Security: admin auth, JSON safety, error scrubbing, body size limits
