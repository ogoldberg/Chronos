# CHRONOS Architecture v2 — Comprehensive Redesign Plan

## 1. Current State Assessment

**Codebase:** 55 TypeScript files across `src/` (44 files) and `server/` (11 files), totaling ~12,670 lines. The application is functional but has accumulated significant architectural debt across 38 commits.

**Critical problems identified:**

- **God component:** `src/App.tsx` (621 lines) holds 23 `useState` hooks, 8 panel visibility toggles, animation logic, keyboard handling, tour playback, and discovery orchestration. Every new feature adds more state here.
- **Monolithic API:** `server/api.ts` (571 lines) is a single `handleApiRequest` function with 14 route branches matched via `if/else` string comparison. No middleware composition, no route isolation, no request validation layer.
- **Inverted data flow:** The client drives discovery via `eventDiscovery.ts`, calls the AI through the server, then optionally writes to the DB. The DB is a write-behind afterthought rather than the source of truth.
- **Fragile caching:** Three independent caches (client memory Map, localStorage, server memory Map) with no coordination, no TTL on the client, and localStorage's 5MB ceiling hit in practice.
- **Dead schema:** `user_progress` and `user_annotations` tables exist but the gamification engine reads/writes exclusively to localStorage. Server sync exists but is never triggered on page load without explicit auth flow.
- **Zero tests.** No unit, integration, or e2e tests.

---

## 2. Database Schema v2

### 2.1 Principles

- The DB is the source of truth for all events, connections, and user data.
- JSONB columns for flexible nested data (citations, multimedia) that does not need to be queried independently.
- Separate normalized tables for relationships that need independent querying (connections, bookmarks, votes).
- Soft deletes via `deleted_at` for audit safety.

### 2.2 Schema

```sql
-- Events: the core entity
CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  slug            TEXT UNIQUE,

  -- Time
  year            DOUBLE PRECISION NOT NULL,
  timestamp       TIMESTAMPTZ,
  precision       TEXT DEFAULT 'year'
    CHECK (precision IN ('year','quarter','month','week','day','hour','minute')),

  -- Display
  emoji           TEXT DEFAULT '📌',
  color           TEXT DEFAULT '#888888',
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'civilization'
    CHECK (category IN ('cosmic','geological','evolutionary','civilization','modern')),
  source          TEXT NOT NULL DEFAULT 'discovered'
    CHECK (source IN ('anchor','discovered','personal','chat')),

  -- Zoom visibility
  zoom_tier       TEXT,
  max_span        DOUBLE PRECISION,

  -- Knowledge + Citations (JSONB)
  wiki            TEXT,
  citations       JSONB DEFAULT '[]',
  confidence      TEXT DEFAULT 'likely'
    CHECK (confidence IN ('verified','likely','speculative')),
  speculative_note TEXT,

  -- Multimedia (JSONB bundle)
  media           JSONB DEFAULT '{}',

  -- Geography
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  geo_type        TEXT CHECK (geo_type IN ('point','path','region','battle','storm')),
  geo_data        JSONB,

  -- Quality
  verified        BOOLEAN DEFAULT FALSE,
  quality_score   REAL DEFAULT 0.0,

  -- Metadata
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

-- Event connections (normalized for graph traversal)
CREATE TABLE IF NOT EXISTS event_connections (
  id              SERIAL PRIMARY KEY,
  source_id       TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  target_id       TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type            TEXT NOT NULL DEFAULT 'related'
    CHECK (type IN ('caused','influenced','preceded','related','led_to','response_to')),
  label           TEXT,
  confidence      TEXT DEFAULT 'likely',
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (source_id, target_id, type)
);

-- Cache regions: track what AI has already discovered
CREATE TABLE IF NOT EXISTS cache_regions (
  id              SERIAL PRIMARY KEY,
  tier_id         TEXT NOT NULL,
  cell_index      INTEGER NOT NULL,
  start_year      DOUBLE PRECISION NOT NULL,
  end_year        DOUBLE PRECISION NOT NULL,
  event_count     INTEGER DEFAULT 0,
  quality         TEXT DEFAULT 'standard',
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days'),
  UNIQUE (tier_id, cell_index, quality)
);

-- User bookmarks
CREATE TABLE IF NOT EXISTS user_bookmarks (
  id              SERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL,
  event_id        TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);

-- User custom lenses
CREATE TABLE IF NOT EXISTS user_lenses (
  id              SERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL,
  name            TEXT NOT NULL,
  emoji           TEXT DEFAULT '🔍',
  color           TEXT DEFAULT '#888',
  description     TEXT,
  tags            JSONB DEFAULT '[]',
  is_public       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- User-created guided tours
CREATE TABLE IF NOT EXISTS user_tours (
  id              SERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  stops           JSONB NOT NULL,
  is_public       BOOLEAN DEFAULT FALSE,
  plays           INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Community quality signals
CREATE TABLE IF NOT EXISTS event_votes (
  id              SERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL,
  event_id        TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  vote            SMALLINT NOT NULL CHECK (vote IN (-1, 1)),
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, event_id)
);

-- Discovery audit log (append-only)
CREATE TABLE IF NOT EXISTS discovery_log (
  id              SERIAL PRIMARY KEY,
  tier_id         TEXT NOT NULL,
  start_year      DOUBLE PRECISION NOT NULL,
  end_year        DOUBLE PRECISION NOT NULL,
  provider        TEXT NOT NULL,
  model           TEXT NOT NULL,
  events_generated INTEGER DEFAULT 0,
  events_persisted INTEGER DEFAULT 0,
  lens            TEXT,
  latency_ms      INTEGER,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- User progress
CREATE TABLE IF NOT EXISTS user_progress (
  user_id         TEXT PRIMARY KEY,
  xp              INTEGER DEFAULT 0,
  level           INTEGER DEFAULT 1,
  events_viewed   INTEGER DEFAULT 0,
  eras_explored   JSONB DEFAULT '[]',
  quiz_streak     INTEGER DEFAULT 0,
  best_streak     INTEGER DEFAULT 0,
  achievements    JSONB DEFAULT '[]',
  total_correct   INTEGER DEFAULT 0,
  total_attempted INTEGER DEFAULT 0,
  myths_revealed  INTEGER DEFAULT 0,
  continents_visited JSONB DEFAULT '[]',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 2.3 Key Decisions

- **Citations as JSONB on events:** Always read with the event, never queried independently.
- **Connections as separate table:** Needs independent graph traversal.
- **`cache_regions` table:** The critical missing piece — tracks what AI has discovered so the API serves DB-first.
- **`media` as JSONB:** Six media fields always travel together.

---

## 3. Data Flow Redesign

### Current (problematic)
```
User scrolls → Client discoverEvents() →
  POST /api/discover → AI generates → response to client →
  Client stores in localStorage → optionally writes to DB
```

### Target
```
Phase 1: Check DB
  User scrolls → GET /api/events?start=X&end=Y&tier=Z →
    Server checks cache_regions →
      If covered: serve from DB → done
      If NOT covered: proceed to Phase 2

Phase 2: AI Discovery (server-side)
  Server calls AI → writes events to DB → marks cache_region →
    Returns events to client

Phase 3: Client rendering
  Client receives events → renders on canvas →
    Memory cache only (no localStorage for events)
```

### DB Warming
Create `server/seed.ts` that systematically covers the timeline:
1. Human history: all cells from -10000 to 2025 (~200 cells)
2. Geological/evolutionary: broader tier cells
3. Cosmic: widest tier cells
Run as background job, rate-limited to 1 req/sec.

---

## 4. Caching Strategy

### New Hierarchy
```
Layer 1: Client Memory (Map) — current session, no TTL, 3000 event LRU
Layer 2: HTTP Cache (Cache-Control headers) — browser + CDN
Layer 3: PostgreSQL + cache_regions — source of truth, 30-day TTL
Layer 4: Server Memory (optional) — LRU for hot queries, only if needed
```

### HTTP Headers
- `GET /api/events`: `Cache-Control: public, max-age=300, stale-while-revalidate=3600`
- `POST /api/discover`: `Cache-Control: no-store`
- `GET /api/search`: `Cache-Control: private, max-age=60`
- `POST /api/chat`: `Cache-Control: no-store`

### Drop localStorage for Events
Keep localStorage only for: player stats (until auth sync reliable), UI preferences.

### Redis: Not needed yet
PostgreSQL with proper indexes handles all current query patterns. Add Redis only for multi-instance deployment or >100 concurrent users.

---

## 5. State Management — Zustand

### Why Zustand
- No provider wrapper nesting (Context would need 5+ providers)
- Subscribable slices (components re-render only when their slice changes)
- ~1KB gzipped, works outside React
- Devtools support

### Store Slices

**`timelineStore`**: viewport, events, selection, discovery
**`uiStore`**: active panel (one at a time), preferences, lens
**`tourStore`**: tour playback state machine
**`gameStore`**: XP, achievements, server sync

### Impact on App.tsx
Shrinks from ~621 lines to ~120 lines. All state lives in stores. App becomes a layout shell + `<PanelRouter>`.

---

## 6. API Route Organization

Split `server/api.ts` (571 lines, 14 routes) into:
```
server/api/
├── index.ts              # Router composition
├── middleware/
│   ├── rateLimit.ts
│   ├── auth.ts
│   ├── validate.ts       # Zod schemas
│   └── cache.ts          # Cache-Control headers
├── routes/
│   ├── events.ts         # GET /api/events, GET /api/search
│   ├── discover.ts       # POST /api/discover (DB-first)
│   ├── chat.ts           # POST /api/chat, /api/chat/stream
│   ├── insights.ts
│   ├── parallels.ts
│   ├── myths.ts
│   ├── quiz.ts
│   ├── lens.ts
│   ├── whatif.ts
│   ├── user.ts           # progress, bookmarks, lenses, tours
│   ├── config.ts
│   └── admin.ts          # seed, warm
└── schemas/              # Zod validation schemas
```

Each route file exports a function receiving the Express router. Zod validates all inputs.

### API Versioning
Don't add `/api/v1/` yet. Instead, add `X-API-Version: 2026-04-01` response header. Add `Accept-Version` header support when breaking changes are needed.

---

## 7. Feature Module Architecture

```
src/features/
├── chat/           # AI chat guide
├── globe/          # 3D globe + empires
├── events/         # EventCard, EventList
├── tour/           # TourOverlay
├── discovery/      # Event discovery orchestration
├── insights/       # InsightsPanel
├── comparison/     # ComparisonView, LaneToggle
├── classroom/      # ClassroomMode
├── gamification/   # StatsBar, AchievementToast, QuizPanel, game engine
├── myths/          # MythBuster
├── lenses/         # LensExplorer
├── search/         # SearchPanel (Ctrl+K)
├── whatif/         # WhatIfPanel
├── auth/           # AuthPanel, authClient
└── personal/       # PersonalTimeline
```

Features communicate through Zustand stores, never prop drilling.

---

## 8. Testing Strategy

### Tooling
Vitest + Testing Library + Playwright + MSW

### Phase 1 (~20 tests, immediate)
- Server route tests: discover (DB-first), events (range queries), chat (validation)
- DB tests: upsert, search, cache regions
- Store tests: timeline dedup, UI panel exclusion, game XP

### Phase 2 (~15 tests, 2 weeks)
- Canvas: viewport math, hit testing, clustering
- Discovery: tier selection, queue management
- E2E: navigation, discovery flow, search

---

## 9. Performance at Scale

- **100K events:** B-tree index handles range queries in <5ms. Add cursor pagination for search.
- **Canvas 200 events:** Clustering already handles this. Add render budget cap at 150 markers.
- **Network:** DB-first discovery eliminates most AI calls after warming. Increase debounce to 1000ms.
- **Batch inserts:** Replace sequential upserts with single multi-row INSERT.

---

## 10. Implementation Phases

### Phase 1: Foundation (Week 1-2)
1. Add Zustand, create 4 stores, shrink App.tsx
2. Split API routes into modules, add Zod validation
3. Schema v2 migration (cache_regions, votes, discovery_log, citations JSONB)

### Phase 2: Data Flow (Week 2-3)
4. DB-first discovery (check cache_regions before calling AI)
5. Remove localStorage event cache
6. DB warming script

### Phase 3: Testing (Week 3-4)
7. Vitest setup + 20 minimum viable tests

### Phase 4: Features (Week 4+)
8. Search, Personal timeline, Time-lapse, Debate mode, Export/embed

### Phase 5: Polish (Ongoing)
9. Performance (batch inserts, spatial index, render budget)
10. E2E tests, Redis (only if needed)
