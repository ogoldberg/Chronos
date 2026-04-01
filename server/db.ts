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
-- Enable PostGIS if available (optional, graceful fallback)
-- CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS events (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,

  -- Time: dual representation for flexibility
  -- "year" is a float for ancient/cosmic events (e.g. -13800000000, -3300.5)
  -- "timestamp" is for events with known date/time precision
  year            DOUBLE PRECISION NOT NULL,
  timestamp       TIMESTAMPTZ,          -- NULL for events before ~4000 BCE
  precision       TEXT DEFAULT 'year',   -- 'year', 'quarter', 'month', 'week', 'day', 'hour', 'minute'

  -- Display
  emoji           TEXT DEFAULT '📌',
  color           TEXT DEFAULT '#888888',
  description     TEXT,
  category        TEXT NOT NULL DEFAULT 'civilization',
  source          TEXT NOT NULL DEFAULT 'discovered',  -- anchor, discovered, chat, user

  -- Zoom tier this event was discovered at (for filtering)
  zoom_tier       TEXT,
  max_span        DOUBLE PRECISION,     -- hide when viewport span > this

  -- Wikipedia / knowledge
  wiki            TEXT,                  -- Wikipedia article title

  -- Multimedia
  image_url       TEXT,                  -- primary image
  thumbnail_url   TEXT,                  -- thumbnail for timeline
  video_url       TEXT,                  -- video link (YouTube, etc.)
  audio_url       TEXT,                  -- audio narration or related audio
  media_caption   TEXT,                  -- caption for primary media
  media_credit    TEXT,                  -- attribution

  -- Geographic
  lat             DOUBLE PRECISION,
  lng             DOUBLE PRECISION,
  geo_type        TEXT,                  -- point, path, region, battle, storm
  path            JSONB,                -- [[lat,lng],...] for journeys
  region          JSONB,                -- [[lat,lng],...] polygon for territories

  -- Metadata
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  verified        BOOLEAN DEFAULT FALSE,
  upvotes         INTEGER DEFAULT 0,
  downvotes       INTEGER DEFAULT 0
);

-- Event connections / causality
CREATE TABLE IF NOT EXISTS event_connections (
  id              SERIAL PRIMARY KEY,
  source_id       TEXT NOT NULL,           -- event that causes/influences
  target_id       TEXT NOT NULL,           -- event that is caused/influenced
  type            TEXT NOT NULL DEFAULT 'related',  -- caused, influenced, preceded, related, led_to, response_to
  label           TEXT,                    -- human-readable: "sparked", "enabled", etc.
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conn_source ON event_connections (source_id);
CREATE INDEX IF NOT EXISTS idx_conn_target ON event_connections (target_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conn_pair ON event_connections (source_id, target_id, type);

-- Primary query: "give me events in year range at zoom level"
CREATE INDEX IF NOT EXISTS idx_events_year ON events (year);
CREATE INDEX IF NOT EXISTS idx_events_year_category ON events (year, category);
CREATE INDEX IF NOT EXISTS idx_events_zoom ON events (max_span, year);
CREATE INDEX IF NOT EXISTS idx_events_source ON events (source);
CREATE INDEX IF NOT EXISTS idx_events_title ON events (title);

-- Geographic index (without PostGIS, use simple btree)
CREATE INDEX IF NOT EXISTS idx_events_geo ON events (lat, lng) WHERE lat IS NOT NULL;

-- Full-text search
CREATE INDEX IF NOT EXISTS idx_events_fts ON events
  USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));

-- Timestamp index for precise queries
CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events (timestamp) WHERE timestamp IS NOT NULL;
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
      event.lat || null, event.lng || null,
      event.geo_type || null,
      event.path ? JSON.stringify(event.path) : null,
      event.region ? JSON.stringify(event.region) : null,
      event.verified ?? false,
    ],
  );
}

export async function upsertEvents(events: Array<Partial<DBEvent> & { id: string; title: string; year: number }>) {
  for (const event of events) {
    await upsertEvent(event);
  }
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
