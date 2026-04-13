/**
 * On This Day — fetches historical events from Wikipedia + Wikidata
 *
 * Wikipedia "On this day" API provides well-curated modern events (post-1400).
 * Wikidata SPARQL supplements with ancient/medieval events that Wikipedia misses.
 * Results are merged, deduplicated, and curated for thematic diversity.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface OnThisDayEvent {
  year: number;
  title: string;
  description: string;
  theme: Theme;
  wikipedia?: { title: string; url: string; thumbnail?: string; extract?: string };
  source: 'wikipedia' | 'wikidata';
}

type Theme =
  | 'war-conflict'
  | 'politics-governance'
  | 'science-technology'
  | 'exploration-geography'
  | 'culture-arts'
  | 'religion-philosophy'
  | 'disaster-tragedy'
  | 'sports'
  | 'birth'
  | 'death'
  | 'other';

// ── Theme classification ─────────────────────────────────────────────

const THEME_PATTERNS: [RegExp, Theme][] = [
  [/\b(war|battle|invasion|siege|military|army|troops|surrender|armistice|treaty of|bomb|nuclear|missile|revolt|rebellion|insurgent|coup)\b/i, 'war-conflict'],
  [/\b(election|president|parliament|congress|senate|law|constitution|amendment|independence|republic|monarchy|emperor|king|queen|prime minister|governor|political|legislation|vote|democracy|abolish|decree)\b/i, 'politics-governance'],
  [/\b(discover|invent|patent|experiment|theory|scientist|launch|space|nasa|orbit|satellite|computer|internet|vaccine|dna|atom|physics|chemistry|biology|telescope|microscope|engine|electric|radio|telegraph|telephone|railroad|railway|aircraft|flight|medicine)\b/i, 'science-technology'],
  [/\b(explore|expedition|voyage|discover.*land|coloniz|settle|continent|ocean|pole|arctic|antarctic|pacific|atlantic|circumnavigat|map|cartograph|sail|navigate)\b/i, 'exploration-geography'],
  [/\b(art|music|paint|sculpt|compos|novel|poem|film|movie|theater|theatre|opera|symphony|ballet|architect|museum|gallery|literary|book|publish|writer|author|singer|album|concert|olympi|sport|championship|world cup|tournament|medal|record)\b/i, 'culture-arts'],
  [/\b(church|pope|bishop|mosque|temple|religion|faith|christian|islam|buddhis|hindu|jewish|reform|protestant|catholic|crusad|pilgrim|monastery|saint|prophet|philosophy|philosopher)\b/i, 'religion-philosophy'],
  [/\b(earthquake|tsunami|hurricane|flood|famine|plague|pandemic|epidemic|fire|explosion|crash|sinking|disaster|catastroph|erupt|volcanic|drought|cyclone)\b/i, 'disaster-tragedy'],
  [/\b(olympi|world cup|championship|tournament|medal|match|game|team|player|score|league|cup final|stadium|race|marathon|boxing)\b/i, 'sports'],
];

function classifyTheme(text: string): Theme {
  for (const [pattern, theme] of THEME_PATTERNS) {
    if (pattern.test(text)) return theme;
  }
  return 'other';
}

// ── Wikipedia On This Day API ────────────────────────────────────────

interface WikiOnThisDayResponse {
  selected?: WikiOTDEntry[];
  events?: WikiOTDEntry[];
  births?: WikiOTDEntry[];
  deaths?: WikiOTDEntry[];
  holidays?: WikiOTDEntry[];
}

interface WikiOTDEntry {
  text: string;
  year: number;
  pages: WikiOTDPage[];
}

interface WikiOTDPage {
  title: string;
  extract?: string;
  thumbnail?: { source: string; width: number; height: number };
  content_urls?: { desktop?: { page: string } };
  description?: string;
}

async function fetchWikipediaOnThisDay(month: number, day: number): Promise<OnThisDayEvent[]> {
  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/all/${mm}/${dd}`;

  const resp = await fetch(url, {
    headers: { 'User-Agent': 'Chronos/1.0 (https://github.com/chronos; contact@chronos.app)' },
  });
  if (!resp.ok) throw new Error(`Wikipedia API returned ${resp.status}`);

  const data: WikiOnThisDayResponse = await resp.json();
  const results: OnThisDayEvent[] = [];

  // Process events (main historical events)
  for (const entry of data.events ?? []) {
    const page = entry.pages?.[0];
    results.push({
      year: entry.year,
      title: truncateTitle(entry.text),
      description: entry.text,
      theme: classifyTheme(entry.text),
      wikipedia: page ? {
        title: page.title,
        url: page.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
        thumbnail: page.thumbnail?.source,
        extract: page.extract,
      } : undefined,
      source: 'wikipedia',
    });
  }

  // Process selected (editorially curated, higher quality)
  for (const entry of data.selected ?? []) {
    // Avoid duplicates — selected events overlap with events
    if (results.some(r => r.year === entry.year && fuzzyMatch(r.description, entry.text))) continue;
    const page = entry.pages?.[0];
    results.push({
      year: entry.year,
      title: truncateTitle(entry.text),
      description: entry.text,
      theme: classifyTheme(entry.text),
      wikipedia: page ? {
        title: page.title,
        url: page.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
        thumbnail: page.thumbnail?.source,
        extract: page.extract,
      } : undefined,
      source: 'wikipedia',
    });
  }

  // Add a few notable births/deaths (limit to keep events primary)
  for (const entry of (data.births ?? []).slice(0, 5)) {
    const page = entry.pages?.[0];
    results.push({
      year: entry.year,
      title: `Birth of ${truncateTitle(entry.text)}`,
      description: entry.text,
      theme: 'birth',
      wikipedia: page ? {
        title: page.title,
        url: page.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
        thumbnail: page.thumbnail?.source,
        extract: page.extract,
      } : undefined,
      source: 'wikipedia',
    });
  }

  for (const entry of (data.deaths ?? []).slice(0, 5)) {
    const page = entry.pages?.[0];
    results.push({
      year: entry.year,
      title: `Death of ${truncateTitle(entry.text)}`,
      description: entry.text,
      theme: 'death',
      wikipedia: page ? {
        title: page.title,
        url: page.content_urls?.desktop?.page ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(page.title)}`,
        thumbnail: page.thumbnail?.source,
        extract: page.extract,
      } : undefined,
      source: 'wikipedia',
    });
  }

  return results;
}

// ── Wikidata SPARQL (ancient/medieval supplement) ────────────────────

async function fetchWikidataEvents(month: number, day: number): Promise<OnThisDayEvent[]> {
  const query = `
    SELECT ?event ?eventLabel ?date ?articleUrl ?eventDescription WHERE {
      ?event wdt:P31/wdt:P279* wd:Q1190554 .
      ?event wdt:P585 ?date .
      FILTER(MONTH(?date) = ${month} && DAY(?date) = ${day})
      FILTER(YEAR(?date) < 1400)
      OPTIONAL {
        ?article schema:about ?event ;
                 schema:isPartOf <https://en.wikipedia.org/> ;
                 schema:name ?articleTitle .
        BIND(CONCAT("https://en.wikipedia.org/wiki/", ENCODE_FOR_URI(?articleTitle)) AS ?articleUrl)
      }
      SERVICE wikibase:label { bd:serviceParam wikibase:language "en" }
      OPTIONAL { ?event schema:description ?eventDescription . FILTER(LANG(?eventDescription) = "en") }
    }
    LIMIT 30
  `;

  try {
    const url = `https://query.wikidata.org/sparql?query=${encodeURIComponent(query)}&format=json`;
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Chronos/1.0 (https://github.com/chronos; contact@chronos.app)' },
    });
    if (!resp.ok) return []; // Graceful fallback — Wikidata is supplementary

    const data = await resp.json();
    const results: OnThisDayEvent[] = [];

    for (const binding of data.results?.bindings ?? []) {
      const label = binding.eventLabel?.value;
      if (!label || label.startsWith('Q')) continue; // Skip unresolved QIDs

      const dateStr = binding.date?.value;
      const year = dateStr ? new Date(dateStr).getFullYear() : NaN;
      if (isNaN(year)) continue;

      const description = binding.eventDescription?.value || label;
      const articleUrl = binding.articleUrl?.value;

      results.push({
        year,
        title: truncateTitle(label),
        description,
        theme: classifyTheme(label + ' ' + description),
        wikipedia: articleUrl ? {
          title: label,
          url: articleUrl,
        } : undefined,
        source: 'wikidata',
      });
    }

    return results;
  } catch {
    return []; // Wikidata is best-effort
  }
}

// ── Merge & curate ──────────────────────────────────────────────────

function deduplicateEvents(events: OnThisDayEvent[]): OnThisDayEvent[] {
  const seen = new Map<string, OnThisDayEvent>();
  for (const evt of events) {
    const key = `${evt.year}-${evt.title.toLowerCase().slice(0, 30)}`;
    if (!seen.has(key)) {
      seen.set(key, evt);
    }
  }
  return Array.from(seen.values());
}

/**
 * Select a diverse set of events with good thematic coverage.
 * Ensures no single theme dominates, and mixes eras.
 */
function curateDiverseSelection(events: OnThisDayEvent[], count: number): OnThisDayEvent[] {
  if (events.length <= count) return events.sort((a, b) => a.year - b.year);

  // Bucket by theme
  const buckets = new Map<Theme, OnThisDayEvent[]>();
  for (const evt of events) {
    const arr = buckets.get(evt.theme) || [];
    arr.push(evt);
    buckets.set(evt.theme, arr);
  }

  const selected: OnThisDayEvent[] = [];
  const usedYears = new Set<number>();

  // Round-robin across themes for diversity
  const themeOrder: Theme[] = [
    'science-technology', 'war-conflict', 'culture-arts', 'politics-governance',
    'exploration-geography', 'disaster-tragedy', 'religion-philosophy', 'sports',
    'birth', 'death', 'other',
  ];

  // First pass: one from each theme that has events
  for (const theme of themeOrder) {
    if (selected.length >= count) break;
    const bucket = buckets.get(theme);
    if (!bucket || bucket.length === 0) continue;

    // Pick a random event from this theme, preferring era diversity
    const pick = pickEraBalanced(bucket, usedYears);
    if (pick) {
      selected.push(pick);
      usedYears.add(eraKey(pick.year));
    }
  }

  // Second pass: fill remaining slots, prefer underrepresented eras
  if (selected.length < count) {
    const remaining = events.filter(e => !selected.includes(e));
    // Shuffle for randomness
    shuffleArray(remaining);

    for (const evt of remaining) {
      if (selected.length >= count) break;
      // Prefer events from eras not yet represented
      const era = eraKey(evt.year);
      if (!usedYears.has(era) || selected.length < count - 2) {
        selected.push(evt);
        usedYears.add(era);
      }
    }
  }

  return selected.sort((a, b) => a.year - b.year);
}

function eraKey(year: number): number {
  if (year < 0) return -1;       // BCE
  if (year < 500) return 0;      // Late Antiquity
  if (year < 1000) return 1;     // Early Medieval
  if (year < 1400) return 2;     // Late Medieval
  if (year < 1600) return 3;     // Renaissance
  if (year < 1800) return 4;     // Early Modern
  if (year < 1900) return 5;     // 19th century
  if (year < 1950) return 6;     // Early 20th
  if (year < 2000) return 7;     // Late 20th
  return 8;                      // 21st century
}

function pickEraBalanced(events: OnThisDayEvent[], usedEras: Set<number>): OnThisDayEvent | null {
  // Prefer an event from an era not yet used
  const fromNewEra = events.filter(e => !usedEras.has(eraKey(e.year)));
  const pool = fromNewEra.length > 0 ? fromNewEra : events;
  return pool[Math.floor(Math.random() * pool.length)] ?? null;
}

// ── Helpers ─────────────────────────────────────────────────────────

function truncateTitle(text: string): string {
  // Extract a concise title from a longer description
  const first = text.split(/[.;\u2013\u2014]/, 1)[0]?.trim() ?? text;
  return first.length > 80 ? first.slice(0, 77) + '...' : first;
}

function fuzzyMatch(a: string, b: string): boolean {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
  return normalize(a) === normalize(b);
}

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
}

// ── Server-side cache ───────────────────────────────────────────────

interface CachedResult {
  events: OnThisDayEvent[];
  allEvents: OnThisDayEvent[];
  fetchedAt: number;
}

const cache = new Map<string, CachedResult>();
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// ── Public API ──────────────────────────────────────────────────────

/**
 * Fetch and curate "on this day" events for the given date.
 * Returns a curated selection (default 8) plus the full pool for client-side exploration.
 */
export async function getOnThisDayEvents(
  month: number,
  day: number,
  count = 8,
): Promise<{ curated: OnThisDayEvent[]; total: number }> {
  const key = `${month}-${day}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL) {
    // Re-curate on each request for randomness variety
    return { curated: curateDiverseSelection(cached.allEvents, count), total: cached.allEvents.length };
  }

  // Fetch both sources concurrently
  const [wikiEvents, wikidataEvents] = await Promise.all([
    fetchWikipediaOnThisDay(month, day),
    fetchWikidataEvents(month, day),
  ]);

  const allEvents = deduplicateEvents([...wikiEvents, ...wikidataEvents]);

  cache.set(key, { events: allEvents, allEvents, fetchedAt: Date.now() });

  return { curated: curateDiverseSelection(allEvents, count), total: allEvents.length };
}

/**
 * Get all events for a date (for "show more" / exploration).
 * Groups by theme for browsability.
 */
export async function getAllOnThisDayEvents(
  month: number,
  day: number,
): Promise<{ events: OnThisDayEvent[]; byTheme: Record<string, OnThisDayEvent[]> }> {
  const { curated, total } = await getOnThisDayEvents(month, day, 999);

  const key = `${month}-${day}`;
  const cached = cache.get(key);
  const all = cached?.allEvents ?? curated;

  const byTheme: Record<string, OnThisDayEvent[]> = {};
  for (const evt of all) {
    (byTheme[evt.theme] ??= []).push(evt);
  }

  return { events: all.sort((a, b) => a.year - b.year), byTheme };
}
