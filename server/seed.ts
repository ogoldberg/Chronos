/**
 * DB Warming Script
 *
 * Systematically pre-populates the database with historical events
 * across all zoom tiers. Run once on initial deploy, then periodically
 * for stale regions.
 *
 * Usage:
 *   node --import tsx server/seed.ts
 *   node --import tsx server/seed.ts --tier=century --dry-run
 *
 * Requires: DATABASE_URL and ANTHROPIC_API_KEY (or other AI provider)
 */

import { initDB, upsertEvents, getEventsInRange } from './db';
import { getCacheRegion, markCacheRegion, logDiscovery } from './db';
import { createProvider, getProviderConfig } from './providers/index';
import { DISCOVER_SYSTEM } from './prompts';
import { ANCHOR_EVENTS } from '../src/data/anchorEvents';

// ── Configuration ──

const TIERS = [
  // Priority 1: Human history (most explored)
  { id: 'century',    cellSize: 100,   count: 12, startYear: -3000,  endYear: 2025 },
  { id: 'historical', cellSize: 500,   count: 12, startYear: -10000, endYear: 2025 },
  { id: 'classical',  cellSize: 2000,  count: 12, startYear: -10000, endYear: 2025 },

  // Priority 2: Deep history
  { id: 'ancient',    cellSize: 10000, count: 10, startYear: -100000, endYear: -10000 },
  { id: 'deep',       cellSize: 50000, count: 10, startYear: -500000, endYear: -100000 },

  // Priority 3: Geological/evolutionary
  { id: 'era',        cellSize: 200000,   count: 10, startYear: -2000000,   endYear: -500000 },
  { id: 'age',        cellSize: 1000000,  count: 10, startYear: -10000000,  endYear: -2000000 },
  { id: 'epoch',      cellSize: 5000000,  count: 10, startYear: -66000000,  endYear: -10000000 },
  { id: 'evolutionary', cellSize: 20000000, count: 8, startYear: -600000000, endYear: -66000000 },

  // Priority 4: Cosmic
  { id: 'geological', cellSize: 100000000,  count: 8, startYear: -4600000000, endYear: -600000000 },
  { id: 'galactic',   cellSize: 500000000,  count: 8, startYear: -13800000000, endYear: -4600000000 },
];

const DELAY_MS = 2000; // 2 seconds between AI calls (rate limiting)

function getEraContext(startYear: number): string {
  const abs = Math.abs(startYear);
  if (abs > 1e9) return 'Focus on cosmic events. Use category "cosmic".';
  if (abs > 1e8) return 'Focus on geological events. Use category "geological".';
  if (abs > 1e6) return 'Focus on evolutionary events. Use category "evolutionary".';
  if (startYear < -3000) return 'Focus on early human history. Use category "civilization".';
  if (startYear < 1500) return 'Focus on civilizations. Use category "civilization".';
  return 'Focus on modern history. Use category "modern".';
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Main ──

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const tierFilter = args.find(a => a.startsWith('--tier='))?.split('=')[1];
  const skipExisting = !args.includes('--force');

  console.log('╔══════════════════════════════════════════╗');
  console.log('║     CHRONOS DB Warming Script            ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Tier filter: ${tierFilter || 'all'}`);
  console.log(`Skip existing: ${skipExisting}`);
  console.log('');

  // Init DB
  if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL is required');
    process.exit(1);
  }
  await initDB();
  console.log('[DB] Connected\n');

  // Seed anchor events first
  console.log(`[Seed] Upserting ${ANCHOR_EVENTS.length} anchor events...`);
  if (!dryRun) {
    await upsertEvents(ANCHOR_EVENTS.map(e => ({
      id: e.id,
      title: e.title,
      year: e.year,
      emoji: e.emoji,
      color: e.color,
      description: e.description,
      category: e.category,
      source: 'anchor' as const,
      max_span: e.maxSpan,
      wiki: e.wiki,
      lat: e.lat,
      lng: e.lng,
      geo_type: e.geoType,
      path: e.path,
      region: e.region,
      verified: true,
    })));
    console.log('[Seed] Anchor events upserted\n');
  }

  // Init AI provider
  const provider = createProvider();
  const config = getProviderConfig();
  console.log(`[AI] Provider: ${config.provider} | Model: ${config.model}\n`);

  const tiers = tierFilter ? TIERS.filter(t => t.id === tierFilter) : TIERS;
  let totalCells = 0;
  let totalEvents = 0;
  let skipped = 0;

  for (const tier of tiers) {
    const cellCount = Math.ceil((tier.endYear - tier.startYear) / tier.cellSize);
    console.log(`\n── Tier: ${tier.id} | ${cellCount} cells | ${tier.startYear} → ${tier.endYear} ──`);

    for (let i = 0; i < cellCount; i++) {
      const cellStart = tier.startYear + i * tier.cellSize;
      const cellEnd = cellStart + tier.cellSize;
      const cellIndex = Math.floor(cellStart);

      // Check if already covered
      if (skipExisting) {
        const existing = await getCacheRegion(tier.id, cellIndex);
        if (existing) {
          skipped++;
          continue;
        }
        // Also check if we have events in this range
        const existingEvents = await getEventsInRange(cellStart, cellEnd, undefined, 1);
        if (existingEvents.length > 0) {
          await markCacheRegion(tier.id, cellIndex, cellStart, cellEnd, existingEvents.length);
          skipped++;
          continue;
        }
      }

      if (dryRun) {
        console.log(`  [DRY] Would discover: ${cellStart} → ${cellEnd}`);
        totalCells++;
        continue;
      }

      // Call AI
      const t0 = Date.now();
      try {
        const system = DISCOVER_SYSTEM(cellStart, cellEnd, tier.count, getEraContext(cellStart), []);
        const resp = await provider.chat(system, [
          { role: 'user', content: `Generate ${tier.count} historically important events between ${cellStart} and ${cellEnd}. Verify with web search.` },
        ], { maxTokens: 3000, webSearch: true });

        const jsonMatch = resp.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const events = JSON.parse(jsonMatch[0]);
          const dbEvents = events.map((e: any, j: number) => ({
            id: `seed-${tier.id}-${cellStart}-${j}`,
            title: e.title, year: e.year, timestamp: e.timestamp || null,
            precision: e.precision || 'year', emoji: e.emoji || '📌',
            color: e.color || '#888', description: e.description,
            category: e.category || 'civilization', source: 'discovered',
            zoom_tier: tier.id, wiki: e.wiki, lat: e.lat, lng: e.lng,
            geo_type: e.geoType, verified: false,
          }));

          await upsertEvents(dbEvents);
          await markCacheRegion(tier.id, cellIndex, cellStart, cellEnd, events.length);
          await logDiscovery(tier.id, cellStart, cellEnd, config.provider, config.model, events.length, dbEvents.length, undefined, Date.now() - t0);

          totalEvents += events.length;
          totalCells++;
          console.log(`  ✓ ${cellStart} → ${cellEnd}: ${events.length} events (${Date.now() - t0}ms)`);
        } else {
          console.log(`  ✗ ${cellStart} → ${cellEnd}: no events returned`);
          await markCacheRegion(tier.id, cellIndex, cellStart, cellEnd, 0);
        }
      } catch (err: any) {
        console.error(`  ✗ ${cellStart} → ${cellEnd}: ${err.message}`);
      }

      // Rate limit
      await sleep(DELAY_MS);
    }
  }

  console.log('\n══════════════════════════════════════════');
  console.log(`Done! ${totalCells} cells populated, ${totalEvents} events generated, ${skipped} skipped`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
