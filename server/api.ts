import type { Plugin } from 'vite';
import Anthropic from '@anthropic-ai/sdk';

// Server-side cache to avoid duplicate API calls for the same region
const discoveryCache = new Map<string, { events: any[]; timestamp: number }>();
const CACHE_TTL = 1000 * 60 * 60 * 24; // 24 hours
const MAX_CACHE_SIZE = 1000;

function pruneCache() {
  if (discoveryCache.size <= MAX_CACHE_SIZE) return;
  const entries = [...discoveryCache.entries()]
    .sort((a, b) => a[1].timestamp - b[1].timestamp);
  const toRemove = entries.slice(0, entries.length - MAX_CACHE_SIZE);
  for (const [key] of toRemove) discoveryCache.delete(key);
}

export function apiPlugin(): Plugin {
  return {
    name: 'chronos-api',
    configureServer(server) {
      const anthropic = new Anthropic();

      const parseBody = (req: any): Promise<any> =>
        new Promise((resolve) => {
          let body = '';
          req.on('data', (chunk: string) => (body += chunk));
          req.on('end', () => {
            try { resolve(JSON.parse(body)); }
            catch { resolve({}); }
          });
        });

      server.middlewares.use(async (req, res, next) => {
        if (req.method !== 'POST') return next();

        if (req.url === '/api/discover') {
          const { startYear, endYear, existingTitles = [], count = 10, tierId = '' } = await parseBody(req);

          // Check server cache
          const cacheKey = `${tierId}:${startYear}:${endYear}`;
          const cached = discoveryCache.get(cacheKey);
          if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ events: cached.events, cached: true }));
            return;
          }

          // Determine era context for better prompting
          const absStart = Math.abs(startYear);
          let eraContext = '';
          if (absStart > 1e9) eraContext = 'Focus on cosmic and astrophysical events: star formation, galaxy mergers, cosmic structure. Use category "cosmic".';
          else if (absStart > 1e8) eraContext = 'Focus on geological and planetary events: tectonic activity, mass extinctions, ice ages, atmospheric changes. Use category "geological".';
          else if (absStart > 1e6) eraContext = 'Focus on evolutionary milestones: species emergence, migration, adaptation, extinction. Use category "evolutionary".';
          else if (startYear < -3000) eraContext = 'Focus on early human history: tool development, settlement, early agriculture, cultural evolution. Use category "civilization".';
          else if (startYear < 1500) eraContext = 'Focus on civilizations: empires, trade, religion, philosophy, technology, warfare, art, architecture. Use category "civilization".';
          else eraContext = 'Focus on modern history: science, technology, politics, culture, social movements, exploration, industry, warfare. Use category "modern".';

          try {
            const msg = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 3000,
              tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
              system: `You are a historian generating events for an interactive timeline. Return ONLY a JSON array of events. Each event must be a REAL, VERIFIED historical/scientific event. Use web search to verify facts when needed.

TIME PERIOD: ${startYear} to ${endYear}
${eraContext}

CRITICAL RULES:
- Return exactly ${count} events, evenly spread across the time range
- Every event MUST be real and verifiable — no fabrication
- Each event needs a specific year (or best scientific estimate for ancient events)
- Include DIVERSE topics within the era — don't cluster on one subject
- Prefer fascinating lesser-known events alongside major ones
- Do NOT include events with these titles: ${existingTitles.slice(0, 30).join(', ')}
- For prehistoric/geological events, use scientific consensus dates
- Descriptions should be vivid, specific, and one sentence
- Wiki titles must be real Wikipedia article titles

Return ONLY a JSON array, no other text:
[{"title":"Event Title","year":1234,"emoji":"🎯","color":"#hexcolor","description":"One vivid sentence.","category":"civilization","wiki":"Wikipedia_Article_Title","lat":40.7,"lng":-74.0,"geoType":"point"}]

GEOGRAPHIC DATA — include for ALL events where a location makes sense:
- lat/lng: approximate coordinates of where the event occurred
- geoType: "point" for events at a location, "path" for journeys/voyages/migrations, "battle" for conflicts, "region" for territorial changes
- path: ONLY for geoType "path" — array of [lat,lng] waypoints, e.g. "path":[[40.7,-74.0],[48.8,2.3]]
- For cosmic/geological events without a specific earthly location, omit lat/lng entirely

Color guide: red=#dc143c warfare/death, blue=#4169e1 exploration/science, gold=#daa520 culture/religion, green=#228b22 nature/environment, purple=#9370db philosophy/ideas, orange=#ff8c00 technology/innovation, pink=#ff69b4 art/music, teal=#20b2aa trade/economics`,
              messages: [
                {
                  role: 'user',
                  content: `Generate ${count} historically important events between ${startYear} and ${endYear}. Search the web to verify key facts. Spread them evenly across the entire range.`,
                },
              ],
            });

            const texts = msg.content
              .filter((b): b is Anthropic.TextBlock => b.type === 'text')
              .map(b => b.text)
              .join('\n');

            const jsonMatch = texts.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const events = JSON.parse(jsonMatch[0]);
              // Cache it
              discoveryCache.set(cacheKey, { events, timestamp: Date.now() });
              pruneCache();
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ events }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ events: [] }));
            }
          } catch (err: any) {
            console.error('Discover error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (req.url === '/api/insights') {
          const { centerYear, span, visibleEvents = [] } = await parseBody(req);

          try {
            const msg = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 500,
              tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
              system: `You generate 3 surprising, specific "did you know?" facts about a historical time period. Be vivid and specific — include names, dates, and unexpected details. Each fact should be 1-2 sentences. Return ONLY a JSON array of 3 strings.`,
              messages: [
                {
                  role: 'user',
                  content: `Time period centered on year ${centerYear} (span: ${span} years). Visible events: ${visibleEvents.join(', ') || 'none'}. Give me 3 fascinating facts about this era.`,
                },
              ],
            });

            const texts = msg.content
              .filter((b): b is Anthropic.TextBlock => b.type === 'text')
              .map(b => b.text)
              .join('\n');

            const jsonMatch = texts.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ insights: JSON.parse(jsonMatch[0]) }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ insights: [] }));
            }
          } catch (err: any) {
            console.error('Insights error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        if (req.url === '/api/chat') {
          const { messages, context } = await parseBody(req);

          try {
            const msg = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 2000,
              tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
              system: `You are CHRONOS Guide — a brilliant, warm historian and science communicator embedded in an interactive timeline spanning the Big Bang to the present day. You ADAPT your depth and vocabulary automatically:
- If someone asks simple questions or seems young, be friendly, vivid, and use analogies a child would love
- If someone asks detailed questions, go deep — cite specific dates, figures, historiographic debates
- If someone says "explain like I'm 5" or "PhD level", adjust accordingly
- Default to an engaging, accessible tone with surprising details

CURRENT TIMELINE VIEW:
${context || '(no context)'}

You have THREE special powers:

1. TIMELINE NAVIGATION: To move the timeline, embed in your text:
   [[GOTO:year,span]]
   Example: "Let me take you there... [[GOTO:1776,50]] Here in 1776..."

2. GUIDED TOURS: When asked to "show me", "tour", or "walk me through" something, create an animated tour by adding at the END of your response:
   [[TOUR:json_array]]
   where json_array is: [{"year":number,"span":number,"text":"narration for this stop"},...]
   Include 4-8 stops. Each "text" should be 1-3 vivid sentences.

3. ADD EVENTS TO TIMELINE: When you mention specific historical events in your response, you can permanently add them to the timeline by embedding:
   [[EVENTS:json_array]]
   where json_array is: [{"title":"Event Title","year":1234,"emoji":"🎯","color":"#hexcolor","description":"One vivid sentence.","category":"civilization","wiki":"Wikipedia_Article_Title","lat":40.7,"lng":-74.0,"geoType":"point"}]

   Use this LIBERALLY — whenever you discuss specific events, add them! This is how the timeline grows.
   For journeys, use geoType:"path" and include a "path" array of [lat,lng] waypoints.
   For battles, use geoType:"battle".
   Categories: cosmic, geological, evolutionary, civilization, modern

RULES:
- Be vivid, specific, and surprising — not generic
- Connect events to broader patterns
- Keep responses concise (2-4 paragraphs max) unless they ask for depth
- For tours, make narration feel like a documentary
- Use web search when you need specific facts or to verify claims
- ALWAYS include [[EVENTS:...]] for any specific events you mention — this builds the timeline`,
              messages,
            });

            const texts = msg.content
              .filter((b): b is Anthropic.TextBlock => b.type === 'text')
              .map(b => b.text)
              .join('\n');

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ content: texts }));
          } catch (err: any) {
            console.error('Chat error:', err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
          }
          return;
        }

        next();
      });
    },
  };
}
