# CHRONOS — Product Vision

## Mission
Make the entirety of history — from the Big Bang to this morning — explorable, understandable, and alive. CHRONOS is an infinite, AI-powered timeline that anyone can navigate through conversation, voice, and touch. A child asking "what happened before dinosaurs?" and a PhD researcher tracing Silk Road trade networks should both feel at home.

## Core Principles

1. **Infinite depth** — There is no bottom. Every zoom level reveals more. The content is generated, verified, and cached dynamically.
2. **Conversation-first** — The AI guide is not a sidebar feature — it's a co-pilot. Voice in, voice out. It drives the timeline, teaches, and remembers.
3. **Geographic context** — History happened in places. The globe isn't decoration — it's a first-class view that shows where, how things moved, and how borders changed.
4. **Model-agnostic** — No lock-in. Swap providers, run locally, use the best model for the job.
5. **Open and extensible** — Users can annotate, contribute, and share. The timeline grows with use.

## Current State (v0.1)

### What's Built
- Canvas-rendered infinite timeline (Big Bang → present)
- 60+ curated anchor events + unlimited AI discovery (15 zoom tiers)
- 3-layer caching (memory → localStorage → server)
- 3D globe with event markers, journey arcs, battle markers
- AI chat guide with context awareness, tours, voice narration (TTS)
- Chat-to-timeline persistence (AI conversations create events)
- Wikipedia integration (images, summaries, links)
- PostgreSQL persistence with full-text search
- Model-agnostic providers (Anthropic, OpenAI, Google, Ollama)
- Production server + Dockerfile + Railway config
- Sub-year time precision + multimedia fields

### What's Missing
See `docs/backlog.md` for the prioritized feature list.
