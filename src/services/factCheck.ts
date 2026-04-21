/**
 * Fact-checking pipeline
 *
 * Cross-references AI-discovered events against Wikidata's structured data
 * to verify dates, locations, and basic facts. Assigns a confidence score.
 */

export interface FactCheckResult {
  verified: boolean;
  confidence: number; // 0-1
  source: 'wikidata' | 'wikipedia' | 'unverified';
  details?: string;
  wikidataId?: string;
}

const cache = new Map<string, FactCheckResult>();

/**
 * Verify an event against Wikidata.
 * Searches by title, checks if the date matches within tolerance.
 */
export async function factCheckEvent(
  title: string,
  year: number,
  _description?: string,
): Promise<FactCheckResult> {
  const key = `${title}:${year}`;
  if (cache.has(key)) return cache.get(key)!;

  try {
    // Step 1: Search Wikidata for the event
    const searchResp = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(title)}&language=en&limit=3&format=json&origin=*`
    );
    if (!searchResp.ok) return unverified(key);
    const searchData = await searchResp.json();
    const entities = searchData.search || [];

    if (entities.length === 0) {
      // Try Wikipedia as fallback — if article exists, moderate confidence
      const wikiResult = await checkWikipedia(title);
      cache.set(key, wikiResult);
      return wikiResult;
    }

    // Step 2: Fetch entity details to verify the date
    for (const entity of entities) {
      const entityId = entity.id;
      const detailResp = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&props=claims&format=json&origin=*`
      );
      if (!detailResp.ok) continue;
      const detailData = await detailResp.json();
      const claims = detailData.entities?.[entityId]?.claims;
      if (!claims) continue;

      // Check point in time (P585) or start time (P580) or inception (P571)
      const dateProps = ['P585', 'P580', 'P571'];
      for (const prop of dateProps) {
        const dateClaims = claims[prop];
        if (!dateClaims?.length) continue;

        const timeValue = dateClaims[0]?.mainsnak?.datavalue?.value?.time;
        if (!timeValue) continue;

        // Parse Wikidata time format: "+1776-07-04T00:00:00Z"
        const match = timeValue.match(/^([+-]?\d+)-/);
        if (!match) continue;

        const wdYear = parseInt(match[1], 10);
        const yearTolerance = Math.abs(year) > 1000 ? 5 : Math.abs(year) > 100 ? 20 : 100;

        if (Math.abs(wdYear - year) <= yearTolerance) {
          const result: FactCheckResult = {
            verified: true,
            confidence: Math.abs(wdYear - year) === 0 ? 1.0 : 0.8,
            source: 'wikidata',
            details: `Wikidata confirms: ${entity.label} (${wdYear})`,
            wikidataId: entityId,
          };
          cache.set(key, result);
          return result;
        }
      }

      // Entity found but date doesn't match — still partially verified
      const result: FactCheckResult = {
        verified: false,
        confidence: 0.3,
        source: 'wikidata',
        details: `Found "${entity.label}" on Wikidata but date mismatch`,
        wikidataId: entityId,
      };
      cache.set(key, result);
      return result;
    }

    return unverified(key);
  } catch {
    return unverified(key);
  }
}

async function checkWikipedia(title: string): Promise<FactCheckResult> {
  try {
    const resp = await fetch(
      `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&format=json&origin=*`
    );
    if (!resp.ok) return { verified: false, confidence: 0, source: 'unverified' };
    const data = await resp.json();
    const pages = data.query?.pages;
    if (!pages) return { verified: false, confidence: 0, source: 'unverified' };
    const page = Object.values(pages)[0] as any;
    if (page.missing !== undefined) {
      return { verified: false, confidence: 0, source: 'unverified' };
    }
    return {
      verified: true,
      confidence: 0.6,
      source: 'wikipedia',
      details: `Wikipedia article exists: "${page.title}"`,
    };
  } catch {
    return { verified: false, confidence: 0, source: 'unverified' };
  }
}

function unverified(key: string): FactCheckResult {
  const result: FactCheckResult = {
    verified: false,
    confidence: 0,
    source: 'unverified',
  };
  cache.set(key, result);
  return result;
}

/**
 * Batch fact-check multiple events.
 * Returns results in the same order as input.
 */
export async function factCheckEvents(
  events: Array<{ title: string; year: number; description?: string }>,
): Promise<FactCheckResult[]> {
  // Run checks in parallel, max 3 concurrent
  const results: FactCheckResult[] = [];
  const BATCH_SIZE = 3;

  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const batch = events.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(e => factCheckEvent(e.title, e.year, e.description))
    );
    results.push(...batchResults);
  }
  return results;
}
