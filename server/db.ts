/**
 * PostgreSQL database layer for CHRONOS
 *
 * Schema supports:
 * - Sub-year precision (timestamp for events with known dates, year for ancient)
 * - Geographic data (lat/lng, paths, regions via PostGIS-compatible columns)
 * - Multimedia (images, video, audio URLs)
 * - Zoom-tier indexing for fast range queries
 * - Source tracking (anchor, discovered, chat, user)
 */

import pg from 'pg';

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/chronos',
    });
  }
  return pool;
}

// ─── Schema ───

export const SCHEMA_SQL = `
-- ============================================================
-- CHRONOS Schema v2
-- ============================================================

CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  slug            TEXT,

  -- Time
  year            DOUBLE PRECISION NOT NULL,
  timestamp       TIMESTAMPTZ,
  precision       TEXT DEFAULT 'year',

  -- Display
  emoji           TEXT DEFAULT '📌',
  color           TEXT DEFAULT '#888888',
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'civilization',
  source          TEXT NOT NULL DEFAULT 'discovered',

  -- Zoom
  zoom_tier       TEXT,
  max_span        DOUBLE PRECISION,

  -- Knowledge (JSONB — not queried independently)
  wiki            TEXT,
  citations       JSONB DEFAULT '[]',
  confidence      TEXT DEFAULT 'likely',
  speculative_note TEXT,

  -- Multimedia (JSONB bundle)
  media           JSONB DEFAULT '{}',
  -- Legacy columns kept for backward compat during migration
  image_url       TEXT,
  thumbnail_url   TEXT,
  video_url       TEXT,
  audio_url       TEXT,
  media_caption   TEXT,
  media_credit    TEXT,

  -- Geography
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  geo_type        TEXT,
  geo_data        JSONB,
  path            JSONB,
  region          JSONB,

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
  source_id       TEXT NOT NULL,
  target_id       TEXT NOT NULL,
  type            TEXT NOT NULL DEFAULT 'related',
  label           TEXT,
  confidence      TEXT DEFAULT 'likely',
  created_by      TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Cache regions: track what AI has discovered
CREATE TABLE IF NOT EXISTS cache_regions (
  id              SERIAL PRIMARY KEY,
  tier_id         TEXT NOT NULL,
  cell_index      INTEGER NOT NULL,
  start_year      DOUBLE PRECISION NOT NULL,
  end_year        DOUBLE PRECISION NOT NULL,
  event_count     INTEGER DEFAULT 0,
  quality         TEXT DEFAULT 'standard',
  lens            TEXT,
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '30 days')
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
  bookmarks       JSONB DEFAULT '[]',
  annotations     JSONB DEFAULT '{}',
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- User bookmarks (normalized)
CREATE TABLE IF NOT EXISTS user_bookmarks (
  id              SERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL,
  event_id        TEXT NOT NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
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

-- User-created tours
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
  event_id        TEXT NOT NULL,
  vote            SMALLINT NOT NULL,
  reason          TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- User annotations
CREATE TABLE IF NOT EXISTS user_annotations (
  id              SERIAL PRIMARY KEY,
  user_id         TEXT NOT NULL,
  event_id        TEXT,
  note            TEXT,
  is_bookmark     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
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

-- ═══ Indexes ═══

CREATE INDEX IF NOT EXISTS idx_events_year ON events (year);
CREATE INDEX IF NOT EXISTS idx_events_year_category ON events (year, category);
CREATE INDEX IF NOT EXISTS idx_events_zoom ON events (max_span, year);
CREATE INDEX IF NOT EXISTS idx_events_source ON events (source);
CREATE INDEX IF NOT EXISTS idx_events_title ON events (title);
CREATE INDEX IF NOT EXISTS idx_events_confidence ON events (confidence);
CREATE INDEX IF NOT EXISTS idx_events_geo ON events (lat, lng) WHERE lat IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_fts ON events
  USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

CREATE INDEX IF NOT EXISTS idx_conn_source ON event_connections (source_id);
CREATE INDEX IF NOT EXISTS idx_conn_target ON event_connections (target_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conn_pair ON event_connections (source_id, target_id, type);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cache_region ON cache_regions (tier_id, cell_index, quality) WHERE lens IS NULL;
CREATE INDEX IF NOT EXISTS idx_cache_tier ON cache_regions (tier_id, cell_index);

CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON user_bookmarks (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bookmarks_pair ON user_bookmarks (user_id, event_id);

CREATE INDEX IF NOT EXISTS idx_votes_event ON event_votes (event_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_pair ON event_votes (user_id, event_id);

CREATE INDEX IF NOT EXISTS idx_user_annotations_user ON user_annotations (user_id);
CREATE INDEX IF NOT EXISTS idx_user_lenses_user ON user_lenses (user_id);
CREATE INDEX IF NOT EXISTS idx_user_tours_user ON user_tours (user_id);
CREATE INDEX IF NOT EXISTS idx_discovery_log_time ON discovery_log (created_at);

-- ═══ Curriculum & Classrooms ═══

CREATE TABLE IF NOT EXISTS curricula (
  id              TEXT PRIMARY KEY,
  teacher_id      TEXT NOT NULL,
  title           TEXT NOT NULL,
  subject         TEXT,
  grade_level     TEXT,
  description     TEXT,
  units           JSONB DEFAULT '[]',
  is_public       BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classrooms (
  id              TEXT PRIMARY KEY,
  teacher_id      TEXT NOT NULL,
  name            TEXT NOT NULL,
  join_code       TEXT UNIQUE NOT NULL,
  curriculum_id   TEXT REFERENCES curricula(id),
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS classroom_students (
  id              SERIAL PRIMARY KEY,
  classroom_id    TEXT NOT NULL,
  user_id         TEXT NOT NULL,
  progress        JSONB DEFAULT '{}',
  joined_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (classroom_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_curricula_teacher ON curricula (teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_teacher ON classrooms (teacher_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_code ON classrooms (join_code);
CREATE INDEX IF NOT EXISTS idx_classroom_students_classroom ON classroom_students (classroom_id);

-- ═══ Moderation Queue ═══

CREATE TABLE IF NOT EXISTS moderation_queue (
  id              SERIAL PRIMARY KEY,
  contribution_type TEXT NOT NULL DEFAULT 'event',
  title           TEXT NOT NULL,
  content         JSONB DEFAULT '{}',
  submitted_by    TEXT NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  reviewed_by     TEXT,
  reviewed_at     TIMESTAMPTZ,
  reject_reason   TEXT,
  submitted_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_moderation_status ON moderation_queue (status);
CREATE INDEX IF NOT EXISTS idx_moderation_submitted ON moderation_queue (submitted_at);
`;

// ─── Queries ───

export interface DBEvent {
  id: string;
  title: string;
  year: number;
  timestamp?: string;
  precision: string;
  emoji: string;
  color: string;
  description: string;
  category: string;
  source: string;
  zoom_tier?: string;
  max_span?: number;
  wiki?: string;
  image_url?: string;
  thumbnail_url?: string;
  video_url?: string;
  audio_url?: string;
  media_caption?: string;
  media_credit?: string;
  lat?: number;
  lng?: number;
  geo_type?: string;
  path?: [number, number][];
  region?: [number, number][];
  verified: boolean;
}

export async function initDB() {
  const db = getPool();
  await db.query(SCHEMA_SQL);
  console.log('[DB] Schema initialized');
}

export async function getEventsInRange(
  startYear: number,
  endYear: number,
  maxSpan?: number,
  limit = 200,
): Promise<DBEvent[]> {
  const db = getPool();
  let query = `
    SELECT * FROM events
    WHERE year >= $1 AND year <= $2
  `;
  const params: any[] = [startYear, endYear];

  if (maxSpan != null) {
    query += ` AND (max_span IS NULL OR max_span >= $3)`;
    params.push(maxSpan);
  }

  query += ` ORDER BY year ASC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await db.query(query, params);
  return result.rows;
}

export async function getEventsByTimestamp(
  start: Date,
  end: Date,
  limit = 200,
): Promise<DBEvent[]> {
  const db = getPool();
  const result = await db.query(
    `SELECT * FROM events
     WHERE timestamp >= $1 AND timestamp <= $2
     ORDER BY timestamp ASC LIMIT $3`,
    [start, end, limit],
  );
  return result.rows;
}

export async function upsertEvent(event: Partial<DBEvent> & { id: string; title: string; year: number }) {
  const db = getPool();
  await db.query(
    `INSERT INTO events (id, title, year, timestamp, precision, emoji, color, description,
       category, source, zoom_tier, max_span, wiki,
       image_url, thumbnail_url, video_url, audio_url, media_caption, media_credit,
       lat, lng, geo_type, path, region, verified)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       image_url = COALESCE(EXCLUDED.image_url, events.image_url),
       thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, events.thumbnail_url),
       video_url = COALESCE(EXCLUDED.video_url, events.video_url),
       audio_url = COALESCE(EXCLUDED.audio_url, events.audio_url),
       updated_at = NOW()`,
    [
      event.id, event.title, event.year,
      event.timestamp || null, event.precision || 'year',
      event.emoji || '📌', event.color || '#888',
      event.description || null, event.category || 'civilization',
      event.source || 'discovered', event.zoom_tier || null,
      event.max_span || null, event.wiki || null,
      event.image_url || null, event.thumbnail_url || null,
      event.video_url || null, event.audio_url || null,
      event.media_caption || null, event.media_credit || null,
      event.lat ?? null, event.lng ?? null,
      event.geo_type || null,
      event.path ? JSON.stringify(event.path) : null,
      event.region ? JSON.stringify(event.region) : null,
      event.verified ?? false,
    ],
  );
}

export async function upsertEvents(events: Array<Partial<DBEvent> & { id: string; title: string; year: number }>) {
  if (events.length === 0) return;
  const db = getPool();

  // Batch insert — single query instead of N sequential queries
  const values: any[] = [];
  const placeholders: string[] = [];
  let paramIdx = 1;

  for (const event of events) {
    const params = [
      event.id, event.title, event.year,
      event.timestamp || null, event.precision || 'year',
      event.emoji || '📌', event.color || '#888',
      event.description || null, event.category || 'civilization',
      event.source || 'discovered', event.zoom_tier || null,
      event.max_span || null, event.wiki || null,
      event.image_url || null, event.thumbnail_url || null,
      event.video_url || null, event.audio_url || null,
      event.media_caption || null, event.media_credit || null,
      event.lat ?? null, event.lng ?? null,
      event.geo_type || null,
      event.path ? JSON.stringify(event.path) : null,
      event.region ? JSON.stringify(event.region) : null,
      event.verified ?? false,
    ];
    const indices = params.map(() => `$${paramIdx++}`);
    placeholders.push(`(${indices.join(',')})`);
    values.push(...params);
  }

  await db.query(
    `INSERT INTO events (id, title, year, timestamp, precision, emoji, color, description,
       category, source, zoom_tier, max_span, wiki,
       image_url, thumbnail_url, video_url, audio_url, media_caption, media_credit,
       lat, lng, geo_type, path, region, verified)
     VALUES ${placeholders.join(', ')}
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       description = EXCLUDED.description,
       image_url = COALESCE(EXCLUDED.image_url, events.image_url),
       thumbnail_url = COALESCE(EXCLUDED.thumbnail_url, events.thumbnail_url),
       updated_at = NOW()`,
    values,
  );
}

export async function searchEvents(query: string, limit = 50): Promise<DBEvent[]> {
  const db = getPool();
  const result = await db.query(
    `SELECT *, ts_rank(
       to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')),
       plainto_tsquery('english', $1)
     ) AS rank
     FROM events
     WHERE to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
           @@ plainto_tsquery('english', $1)
     ORDER BY rank DESC LIMIT $2`,
    [query, limit],
  );
  return result.rows;
}

export interface DBConnection {
  source_id: string;
  target_id: string;
  type: string;
  label?: string;
}

export async function upsertConnection(conn: DBConnection) {
  const db = getPool();
  await db.query(
    `INSERT INTO event_connections (source_id, target_id, type, label)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (source_id, target_id, type) DO UPDATE SET
       label = COALESCE(EXCLUDED.label, event_connections.label)`,
    [conn.source_id, conn.target_id, conn.type, conn.label || null],
  );
}

export async function getConnectionsForEvent(eventId: string): Promise<DBConnection[]> {
  const db = getPool();
  const result = await db.query(
    `SELECT * FROM event_connections WHERE source_id = $1 OR target_id = $1`,
    [eventId],
  );
  return result.rows;
}

export async function getConnectionsInRange(startYear: number, endYear: number): Promise<DBConnection[]> {
  const db = getPool();
  const result = await db.query(
    `SELECT ec.* FROM event_connections ec
     JOIN events e1 ON ec.source_id = e1.id
     JOIN events e2 ON ec.target_id = e2.id
     WHERE (e1.year BETWEEN $1 AND $2) OR (e2.year BETWEEN $1 AND $2)`,
    [startYear, endYear],
  );
  return result.rows;
}

export async function getNearbyEvents(
  lat: number,
  lng: number,
  radiusDeg = 5,
  limit = 50,
): Promise<DBEvent[]> {
  const db = getPool();
  const result = await db.query(
    `SELECT *,
       sqrt(power(lat - $1, 2) + power(lng - $2, 2)) AS distance
     FROM events
     WHERE lat IS NOT NULL
       AND lat BETWEEN $1 - $3 AND $1 + $3
       AND lng BETWEEN $2 - $3 AND $2 + $3
     ORDER BY distance ASC LIMIT $4`,
    [lat, lng, radiusDeg, limit],
  );
  return result.rows;
}

// ─── Cache Regions ───

export async function getCacheRegion(tierId: string, cellIndex: number, quality = 'standard') {
  const db = getPool();
  const result = await db.query(
    `SELECT * FROM cache_regions WHERE tier_id = $1 AND cell_index = $2 AND quality = $3 AND (lens IS NULL)`,
    [tierId, cellIndex, quality],
  );
  return result.rows[0] || null;
}

export async function markCacheRegion(
  tierId: string, cellIndex: number, startYear: number, endYear: number,
  eventCount: number, quality = 'standard', lens?: string,
) {
  const db = getPool();
  await db.query(
    `INSERT INTO cache_regions (tier_id, cell_index, start_year, end_year, event_count, quality, lens, fetched_at, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW() + INTERVAL '30 days')
     ON CONFLICT (tier_id, cell_index, quality) WHERE lens IS NULL
     DO UPDATE SET event_count = EXCLUDED.event_count, fetched_at = NOW(), expires_at = NOW() + INTERVAL '30 days'`,
    [tierId, cellIndex, startYear, endYear, eventCount, quality, lens ?? null],
  );
}

export async function logDiscovery(
  tierId: string, startYear: number, endYear: number,
  provider: string, model: string, eventsGenerated: number,
  eventsPersisted: number, lens?: string, latencyMs?: number,
) {
  const db = getPool();
  await db.query(
    `INSERT INTO discovery_log (tier_id, start_year, end_year, provider, model, events_generated, events_persisted, lens, latency_ms)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [tierId, startYear, endYear, provider, model, eventsGenerated, eventsPersisted, lens ?? null, latencyMs ?? null],
  );
}

// ─── Votes ───

export async function upsertVote(userId: string, eventId: string, vote: number, reason?: string) {
  const db = getPool();
  await db.query(
    `INSERT INTO event_votes (user_id, event_id, vote, reason)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id, event_id) DO UPDATE SET vote = EXCLUDED.vote, reason = EXCLUDED.reason`,
    [userId, eventId, vote, reason ?? null],
  );
}

export async function getEventVotes(eventId: string) {
  const db = getPool();
  const result = await db.query(
    `SELECT COALESCE(SUM(CASE WHEN vote = 1 THEN 1 ELSE 0 END), 0) as upvotes,
            COALESCE(SUM(CASE WHEN vote = -1 THEN 1 ELSE 0 END), 0) as downvotes
     FROM event_votes WHERE event_id = $1`,
    [eventId],
  );
  return result.rows[0];
}

// ─── User Progress ───

export async function getUserProgress(userId: string) {
  const db = getPool();
  const result = await db.query('SELECT * FROM user_progress WHERE user_id = $1', [userId]);
  return result.rows[0] || null;
}

export async function saveUserProgress(userId: string, progress: Record<string, any>) {
  const db = getPool();
  await db.query(
    `INSERT INTO user_progress (user_id, xp, level, events_viewed, eras_explored, quiz_streak, best_streak, achievements, total_correct, total_attempted, myths_revealed, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       xp = EXCLUDED.xp, level = EXCLUDED.level,
       events_viewed = EXCLUDED.events_viewed, eras_explored = EXCLUDED.eras_explored,
       quiz_streak = EXCLUDED.quiz_streak, best_streak = EXCLUDED.best_streak,
       achievements = EXCLUDED.achievements,
       total_correct = EXCLUDED.total_correct, total_attempted = EXCLUDED.total_attempted,
       myths_revealed = EXCLUDED.myths_revealed, updated_at = NOW()`,
    [
      userId,
      progress.xp ?? 0, progress.level ?? 1,
      progress.eventsViewed ?? 0, JSON.stringify(progress.erasExplored ?? []),
      progress.quizStreak ?? 0, progress.bestStreak ?? 0,
      JSON.stringify(progress.achievements ?? []),
      progress.totalCorrect ?? 0, progress.totalAttempted ?? 0,
      progress.mythsRevealed ?? 0,
    ],
  );
}
