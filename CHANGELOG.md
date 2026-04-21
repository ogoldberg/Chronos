# Changelog

Notable changes to Chronos are recorded here.

The format is loosely inspired by [Keep a Changelog][kc]. Dates are
ISO. Unreleased work lives at the top under `## [Unreleased]`.

[kc]: https://keepachangelog.com/en/1.1.0/

## [0.1.0] — 2026-04-21

First open-source release.

### Added
- Infinite zoomable timeline from the Big Bang to the present.
- Wikidata-backed event discovery with nine thematic categories and
  weighted quotas (no single theme — previously "warfare" —
  dominates).
- Knowledge-graph visualization per event (causes, effects, sub-events,
  siblings) sourced from Wikidata properties.
- Thematic timelines / parallel threads with user-proposed convergences
  that the AI validates.
- Today in History (Wikipedia + Wikidata, free).
- Globe view with per-region × year exploration.
- Zero-trust BYOK AI: every AI call runs directly in the browser
  against the user's chosen provider (Anthropic, OpenAI, Google
  Gemini, or local Ollama). No server-side key.
- In-app Settings panel for managing BYOK.

### Changed
- Replaced the server-side AI route surface with browser-direct
  provider adapters in `src/ai/providers/`.
- Removed ~2,500 lines of server-side AI glue that no longer runs on
  user traffic.

### Security
- No server-side API keys. No server-side logging of user messages
  or keys. The Chronos server is not in the path for any AI request.
