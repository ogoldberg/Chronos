import type { Plugin } from 'vite';
import Anthropic from '@anthropic-ai/sdk';

export function apiPlugin(): Plugin {
  return {
    name: 'chronos-api',
    configureServer(server) {
      const anthropic = new Anthropic();

      // Parse JSON body middleware
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
          const { startYear, endYear, existingTitles = [], count = 8 } = await parseBody(req);

          try {
            const msg = await anthropic.messages.create({
              model: 'claude-sonnet-4-20250514',
              max_tokens: 2000,
              tools: [{ type: 'web_search_20250305' as any, name: 'web_search' }],
              system: `You are a historian generating events for an interactive timeline. Return ONLY a JSON array of events. Each event must be a real, verified historical event. Use web search to verify facts.

RULES:
- Return exactly ${count} events between ${startYear} and ${endYear}
- Events must be historically significant and verified
- Spread events across the time range
- Do NOT include events with these titles: ${existingTitles.join(', ')}
- Include diverse topics: politics, science, culture, technology, warfare, religion, art
- Prefer lesser-known but fascinating events over obvious ones

Return ONLY a JSON array in this exact format, no other text:
[{"title":"Event Title","year":1234,"emoji":"🎯","color":"#hexcolor","description":"One vivid sentence about why this matters.","category":"civilization","wiki":"Wikipedia_Article_Title"}]

Categories: cosmic, geological, evolutionary, civilization, modern
Use "modern" for anything after 1500 CE, "civilization" for ancient/medieval.`,
              messages: [
                {
                  role: 'user',
                  content: `Generate ${count} historically important events between ${startYear} and ${endYear}. Search the web to verify your facts.`,
                },
              ],
            });

            // Extract text content
            const texts = msg.content
              .filter((b): b is Anthropic.TextBlock => b.type === 'text')
              .map(b => b.text)
              .join('\n');

            // Parse JSON from response
            const jsonMatch = texts.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
              const events = JSON.parse(jsonMatch[0]);
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

You have TWO special powers:

1. TIMELINE NAVIGATION: To move the timeline, embed in your text:
   [[GOTO:year,span]]
   Example: "Let me take you there... [[GOTO:1776,50]] Here in 1776..."

2. GUIDED TOURS: When asked to "show me", "tour", or "walk me through" something, create an animated tour by adding at the END of your response:
   [[TOUR:json_array]]
   where json_array is: [{"year":number,"span":number,"text":"narration for this stop"},...]
   Include 4-8 stops. Each "text" should be 1-3 vivid sentences.

RULES:
- Be vivid, specific, and surprising — not generic
- Connect events to broader patterns
- Keep responses concise (2-4 paragraphs max) unless they ask for depth
- For tours, make narration feel like a documentary
- Use web search when you need specific facts or to verify claims`,
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
