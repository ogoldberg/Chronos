/**
 * Wikidata Graph Service
 *
 * Leverages Wikidata's SPARQL endpoint to extract rich graph relationships
 * between historical events: causes, effects, sub-events, participants,
 * chronological chains, and geographic context.
 */

const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'Chronos/1.0 (https://chronosapp.org; contact@chronosapp.org)';
const SPARQL_TIMEOUT_MS = 15_000;
const MAX_TITLE_LENGTH = 300;
const QID_PATTERN = /^Q[0-9]+$/;
const MAX_CONNECTIONS_PER_EVENT = 5;

/**
 * Escape a user-supplied string for safe inclusion inside a SPARQL string
 * literal. We strip control characters first (no plain newlines or tabs
 * inside SPARQL string literals) then backslash-escape the SPARQL string
 * delimiters. Without this, an attacker can break out of the literal and
 * append arbitrary triples or BIND clauses to our queries.
 *
 * Note: we only allow this string to be interpolated *inside* a quoted
 * string literal — never as a bare identifier or URI.
 */
function escapeSparqlString(s: string): string {
  return s
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

/**
 * Validate a Wikidata QID before interpolating it into a SPARQL query.
 * QIDs are bare identifiers (e.g. `Q42`) inside the query — no quoting
 * available — so we can't escape them, only reject anything that doesn't
 * match the strict format.
 */
function assertValidQid(qid: string): string {
  if (!QID_PATTERN.test(qid)) {
    throw new Error(`Invalid QID: ${qid.slice(0, 40)}`);
  }
  return qid;
}

/**
 * Sanity-cap a user-supplied title before it touches anything else.
 * Long strings would balloon SPARQL queries and slow Wikidata; titles
 * longer than this in real Wikipedia are vanishingly rare anyway.
 */
function sanitizeTitle(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length > MAX_TITLE_LENGTH) {
    return trimmed.slice(0, MAX_TITLE_LENGTH);
  }
  return trimmed;
}

// ── Types ────────────────────────────────────────────────────────────

export interface WikidataEntity {
  qid: string;
  label: string;
  description?: string;
  year?: number;
  date?: string;
  wikipediaTitle?: string;
}

export interface EventRelation {
  relation: 'caused_by' | 'led_to' | 'part_of' | 'includes' | 'follows' | 'followed_by';
  entity: WikidataEntity;
}

export interface EventContext {
  qid: string;
  label: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  country?: string;
  location?: string;
  coordinates?: { lat: number; lng: number };
  participants: WikidataEntity[];
  relations: EventRelation[];
  image?: string;
}

export interface EnrichedDiscoveryEvent {
  title: string;
  year: number;
  description: string;
  category: string;
  color: string;
  wiki?: string;
  qid?: string;
  lat?: number;
  lng?: number;
  geoType?: string;
  connections?: Array<{
    targetTitle: string;
    targetYear?: number;
    label: string;
    type: 'cause' | 'effect' | 'related' | 'part_of';
  }>;
}

// ── SPARQL helpers ───────────────────────────────────────────────────

/**
 * Execute a SPARQL query against Wikidata.
 *
 * Returns an empty array on any failure (timeout, non-2xx, parse error)
 * because callers treat "no data" as the legitimate empty case. We
 * log non-2xx and timeouts so 429s and Wikidata outages don't silently
 * look like "Wikidata simply doesn't know about this event".
 */
async function sparql(query: string): Promise<any[]> {
  const url = `${WIKIDATA_SPARQL}?query=${encodeURIComponent(query)}&format=json`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SPARQL_TIMEOUT_MS);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
      signal: controller.signal,
    });
    if (!resp.ok) {
      console.warn(`[wikidata] SPARQL ${resp.status} ${resp.statusText}`);
      return [];
    }
    const data = await resp.json() as { results?: { bindings?: any[] } };
    return data.results?.bindings ?? [];
  } catch (err: any) {
    if (err?.name === 'AbortError') {
      console.warn(`[wikidata] SPARQL timeout after ${SPARQL_TIMEOUT_MS}ms`);
    } else {
      console.warn('[wikidata] SPARQL error:', err?.message ?? err);
    }
    return [];
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Bounded LRU-ish cache. We don't need true LRU semantics — just a hard
 * size cap so unique-string lookups (e.g. arbitrary Wikipedia titles)
 * can't grow the heap forever. When full, we drop the oldest insertion
 * order entry, which Map iteration provides for free.
 */
class BoundedCache<K, V> {
  private map = new Map<K, V>();
  private readonly maxSize: number;
  constructor(maxSize: number) {
    this.maxSize = maxSize;
  }
  has(key: K): boolean { return this.map.has(key); }
  get(key: K): V | undefined { return this.map.get(key); }
  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, value);
    if (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }
  delete(key: K): boolean { return this.map.delete(key); }
  get size(): number { return this.map.size; }
}

// ── Resolve Wikipedia title to Wikidata QID ─────────────────────────

/**
 * Bounded so a flood of unique titles (especially negative-cache misses)
 * can't grow the heap forever.
 */
const qidCache = new BoundedCache<string, string | null>(2_000);

/**
 * Resolve a (possibly imperfect) title to a Wikidata QID.
 *
 * Two-step lookup so events whose stored title doesn't exactly match a
 * Wikipedia article (e.g. "1828 Treaty of Montevideo" vs the actual
 * "Preliminary Peace Convention (1828)") still find their entity:
 *
 *   1. SPARQL exact match on `schema:name` — fast, free, works for canonical titles.
 *   2. Fall back to Wikipedia's search API to find the real article title,
 *      then re-run the SPARQL lookup with that canonical title.
 *
 * The Wikipedia API also follows redirects automatically, so titles like
 * "Battle of Focsani" (no diacritics) resolve to "Battle of Focșani".
 */
export async function resolveQID(rawTitle: string): Promise<string | null> {
  const wikipediaTitle = sanitizeTitle(rawTitle);
  if (!wikipediaTitle) return null;
  if (qidCache.has(wikipediaTitle)) return qidCache.get(wikipediaTitle) ?? null;

  const lookup = async (title: string): Promise<string | null> => {
    const bindings = await sparql(`
      SELECT ?item WHERE {
        ?article schema:about ?item ;
                 schema:isPartOf <https://en.wikipedia.org/> ;
                 schema:name "${escapeSparqlString(title)}"@en .
      } LIMIT 1
    `);
    return bindings[0]?.item?.value?.replace('http://www.wikidata.org/entity/', '') ?? null;
  };

  let qid = await lookup(wikipediaTitle);

  // Fallback: ask Wikipedia for the canonical article title and retry.
  if (!qid) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SPARQL_TIMEOUT_MS);
    try {
      const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(wikipediaTitle)}&srlimit=1&format=json&origin=*`;
      const resp = await fetch(searchUrl, {
        headers: { 'User-Agent': USER_AGENT },
        signal: controller.signal,
      });
      if (resp.ok) {
        const data = await resp.json() as { query?: { search?: Array<{ title?: string }> } };
        const canonicalTitle = data.query?.search?.[0]?.title;
        if (canonicalTitle && canonicalTitle !== wikipediaTitle) {
          qid = await lookup(sanitizeTitle(canonicalTitle));
        }
      }
    } catch {
      // Best-effort fallback; leave qid as null on failure.
    } finally {
      clearTimeout(timer);
    }
  }

  qidCache.set(wikipediaTitle, qid);
  return qid;
}

// ── Fetch full event context from graph ─────────────────────────────

export async function getEventContext(rawQid: string): Promise<EventContext | null> {
  const qid = assertValidQid(rawQid);
  const bindings = await sparql(`
    SELECT
      ?label ?description ?startDate ?endDate
      ?country ?countryLabel ?location ?locationLabel
      ?coord ?image
    WHERE {
      BIND(wd:${qid} AS ?event)
      ?event rdfs:label ?label . FILTER(LANG(?label) = "en")
      OPTIONAL { ?event schema:description ?description . FILTER(LANG(?description) = "en") }
      OPTIONAL { ?event wdt:P580 ?startDate }
      OPTIONAL { ?event wdt:P582 ?endDate }
      OPTIONAL { ?event wdt:P17 ?country }
      OPTIONAL { ?event wdt:P276 ?location }
      OPTIONAL { ?event wdt:P625 ?coord }
      OPTIONAL { ?event wdt:P18 ?image }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
    } LIMIT 1
  `);

  if (bindings.length === 0) return null;
  const b = bindings[0];

  let coordinates: { lat: number; lng: number } | undefined;
  if (b.coord?.value) {
    const match = b.coord.value.match(/Point\(([^ ]+) ([^ ]+)\)/);
    if (match) coordinates = { lat: parseFloat(match[2]!), lng: parseFloat(match[1]!) };
  }

  // Fetch participants
  const participantBindings = await sparql(`
    SELECT ?participant ?participantLabel ?participantDescription WHERE {
      wd:${qid} wdt:P710 ?participant .
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
      OPTIONAL { ?participant schema:description ?participantDescription . FILTER(LANG(?participantDescription) = "en") }
    } LIMIT 20
  `);

  const participants: WikidataEntity[] = participantBindings
    .filter(pb => !pb.participantLabel?.value?.startsWith('Q'))
    .map(pb => ({
      qid: pb.participant?.value?.replace('http://www.wikidata.org/entity/', '') ?? '',
      label: pb.participantLabel?.value ?? '',
      description: pb.participantDescription?.value,
    }));

  // Fetch relations (causes, effects, parts, chronological)
  const relationBindings = await sparql(`
    SELECT ?relation ?related ?relatedLabel ?relatedDate ?relatedDescription WHERE {
      {
        wd:${qid} wdt:P828 ?related .
        BIND("caused_by" AS ?relation)
      } UNION {
        wd:${qid} wdt:P1542 ?related .
        BIND("led_to" AS ?relation)
      } UNION {
        wd:${qid} wdt:P527 ?related .
        BIND("includes" AS ?relation)
      } UNION {
        wd:${qid} wdt:P155 ?related .
        BIND("follows" AS ?relation)
      } UNION {
        wd:${qid} wdt:P156 ?related .
        BIND("followed_by" AS ?relation)
      } UNION {
        wd:${qid} wdt:P361 ?related .
        BIND("part_of" AS ?relation)
      } UNION {
        ?related wdt:P361 wd:${qid} .
        BIND("includes" AS ?relation)
      }
      OPTIONAL { ?related wdt:P585 ?relatedDate }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
      OPTIONAL { ?related schema:description ?relatedDescription . FILTER(LANG(?relatedDescription) = "en") }
    } LIMIT 50
  `);

  const relations: EventRelation[] = relationBindings
    .filter(rb => !rb.relatedLabel?.value?.startsWith('Q'))
    .map(rb => {
      const dateStr = rb.relatedDate?.value;
      const year = dateStr ? new Date(dateStr).getFullYear() : undefined;
      return {
        relation: rb.relation?.value as EventRelation['relation'],
        entity: {
          qid: rb.related?.value?.replace('http://www.wikidata.org/entity/', '') ?? '',
          label: rb.relatedLabel?.value ?? '',
          description: rb.relatedDescription?.value,
          year,
          date: dateStr?.slice(0, 10),
        },
      };
    });

  return {
    qid,
    label: b.label?.value ?? '',
    description: b.description?.value,
    startDate: b.startDate?.value?.slice(0, 10),
    endDate: b.endDate?.value?.slice(0, 10),
    country: b.countryLabel?.value,
    location: b.locationLabel?.value,
    coordinates,
    participants,
    relations,
    image: b.image?.value,
  };
}

// ── Enrich discovered events with graph connections ─────────────────

/**
 * Given a batch of discovered events (with wiki titles), enrich them
 * with Wikidata graph relationships. Adds connections, coordinates,
 * and descriptions from the knowledge graph.
 *
 * Runs in parallel with concurrency limit to avoid overloading Wikidata.
 */
export async function enrichEventsWithGraph(
  events: EnrichedDiscoveryEvent[],
  maxConcurrent = 3,
): Promise<EnrichedDiscoveryEvent[]> {
  const enriched = [...events];
  const queue = events
    .map((e, i) => ({ event: e, index: i }))
    .filter(({ event }) => event.wiki);

  const process = async (item: { event: EnrichedDiscoveryEvent; index: number }) => {
    try {
      const qid = await resolveQID(item.event.wiki!);
      if (!qid) return;

      const context = await getEventContext(qid);
      if (!context) return;

      const enrichedEvent = { ...enriched[item.index]!, qid };

      // Add coordinates if missing
      if (!enrichedEvent.lat && context.coordinates) {
        enrichedEvent.lat = context.coordinates.lat;
        enrichedEvent.lng = context.coordinates.lng;
        enrichedEvent.geoType = 'point';
      }

      // Add richer description
      if (context.description && (!enrichedEvent.description || enrichedEvent.description === enrichedEvent.title)) {
        enrichedEvent.description = context.description;
      }

      // Build connections from relations
      const connections: EnrichedDiscoveryEvent['connections'] = [];

      for (const rel of context.relations) {
        if (connections.length >= MAX_CONNECTIONS_PER_EVENT) break;
        let label: string;
        let type: 'cause' | 'effect' | 'related' | 'part_of';

        switch (rel.relation) {
          case 'caused_by':
            label = `Caused by: ${rel.entity.label}`;
            type = 'cause';
            break;
          case 'led_to':
            label = `Led to: ${rel.entity.label}`;
            type = 'effect';
            break;
          case 'part_of':
            label = `Part of: ${rel.entity.label}`;
            type = 'part_of';
            break;
          case 'includes':
            label = `Includes: ${rel.entity.label}`;
            type = 'related';
            break;
          case 'follows':
            label = `Follows: ${rel.entity.label}`;
            type = 'related';
            break;
          case 'followed_by':
            label = `Followed by: ${rel.entity.label}`;
            type = 'effect';
            break;
          default:
            continue;
        }

        connections.push({
          targetTitle: rel.entity.label,
          targetYear: rel.entity.year,
          label,
          type,
        });
      }

      if (connections.length > 0) {
        enrichedEvent.connections = connections;
      }

      enriched[item.index] = enrichedEvent;
    } catch {
      // Enrichment is best-effort
    }
  };

  // Process with concurrency limit
  for (let i = 0; i < queue.length; i += maxConcurrent) {
    const batch = queue.slice(i, i + maxConcurrent);
    await Promise.all(batch.map(process));
  }

  return enriched;
}

// ── Discover related events for a single event ──────────────────────

/**
 * Given an event's Wikipedia title, find related events through the
 * Wikidata graph. Returns events connected by cause/effect, part-of,
 * chronological, or shared participant relationships.
 */
export interface RelatedEventResult {
  title: string;
  year?: number;
  relation: string;
  description?: string;
  wiki?: string;
  qid?: string;
  sharedParent?: string; // e.g. "Seventh Russo-Turkish War"
}

export async function discoverRelatedEvents(
  wikipediaTitle: string,
): Promise<RelatedEventResult[]> {
  const rawQid = await resolveQID(wikipediaTitle);
  if (!rawQid) return [];
  const qid = assertValidQid(rawQid);

  const bindings = await sparql(`
    SELECT DISTINCT ?relation ?related ?relatedLabel ?relatedDate ?relatedStart ?relatedPubDate ?relatedInception ?relatedDescription ?articleTitle ?parentLabel WHERE {
      {
        wd:${qid} wdt:P828 ?related .
        BIND("Caused by" AS ?relation) BIND("" AS ?parentLabel)
      } UNION {
        wd:${qid} wdt:P1542 ?related .
        BIND("Led to" AS ?relation) BIND("" AS ?parentLabel)
      } UNION {
        ?related wdt:P361 wd:${qid} .
        BIND("Sub-event" AS ?relation) BIND("" AS ?parentLabel)
      } UNION {
        wd:${qid} wdt:P361 ?parent .
        ?related wdt:P361 ?parent .
        FILTER(?related != wd:${qid})
        ?parent rdfs:label ?parentLabel . FILTER(LANG(?parentLabel) = "en")
        BIND("sibling" AS ?relation)
      } UNION {
        wd:${qid} wdt:P155 ?related .
        BIND("Preceded by" AS ?relation) BIND("" AS ?parentLabel)
      } UNION {
        wd:${qid} wdt:P156 ?related .
        BIND("Followed by" AS ?relation) BIND("" AS ?parentLabel)
      } UNION {
        wd:${qid} wdt:P361 ?related .
        BIND("Part of" AS ?relation) BIND("" AS ?parentLabel)
      }
      OPTIONAL { ?related wdt:P585 ?relatedDate }
      OPTIONAL { ?related wdt:P580 ?relatedStart }
      OPTIONAL { ?related wdt:P577 ?relatedPubDate }
      OPTIONAL { ?related wdt:P571 ?relatedInception }
      OPTIONAL {
        ?article schema:about ?related ;
                 schema:isPartOf <https://en.wikipedia.org/> ;
                 schema:name ?articleTitle .
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
      OPTIONAL { ?related schema:description ?relatedDescription . FILTER(LANG(?relatedDescription) = "en") }
    }
    LIMIT 40
  `);

  const seen = new Set<string>();
  return bindings
    .filter(b => {
      const label = b.relatedLabel?.value;
      if (!label || label.startsWith('Q')) return false;
      if (seen.has(label)) return false;
      seen.add(label);
      return true;
    })
    .map(b => {
      // Many Wikidata entries lack P585 (point in time) but do have
      // P580 (start time), P577 (publication date), or P571 (inception).
      // Fall through to those so events like "Battle of Ochakiv" that only
      // carry a start date still get a navigable year in the graph.
      const dateStr = b.relatedDate?.value
        ?? b.relatedStart?.value
        ?? b.relatedPubDate?.value
        ?? b.relatedInception?.value;
      const rawRelation = b.relation?.value ?? '';
      const parentLabel = b.parentLabel?.value || '';
      // Build a specific relation label
      const relation = rawRelation === 'sibling' && parentLabel
        ? `Part of: ${parentLabel}`
        : rawRelation;

      return {
        title: b.relatedLabel?.value ?? '',
        year: dateStr ? new Date(dateStr).getFullYear() : undefined,
        relation,
        description: b.relatedDescription?.value,
        wiki: b.articleTitle?.value,
        qid: b.related?.value?.replace('http://www.wikidata.org/entity/', ''),
        sharedParent: parentLabel || undefined,
      };
    });
}

// ── Cache ────────────────────────────────────────────────────────────

const contextCache = new BoundedCache<string, { context: EventContext; fetchedAt: number }>(1_000);
const CONTEXT_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

export async function getCachedEventContext(rawQid: string): Promise<EventContext | null> {
  const qid = assertValidQid(rawQid);
  const cached = contextCache.get(qid);
  if (cached && Date.now() - cached.fetchedAt < CONTEXT_CACHE_TTL) return cached.context;

  const context = await getEventContext(qid);
  if (context) contextCache.set(qid, { context, fetchedAt: Date.now() });
  return context;
}
