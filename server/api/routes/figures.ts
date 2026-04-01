/**
 * POST /api/figures/chat — chat with a historical figure persona
 */

import { z } from 'zod';
import { getProvider } from '../../providers/index';
import { FIGURE_CHAT_SYSTEM } from '../../prompts';
import { checkRateLimit, getClientIP } from '../middleware/rateLimit';
import { validate } from '../middleware/validate';
import type { RouteHandler } from '../index';

const FIGURE_DATA: Record<string, { years: string; bio: string }> = {
  'Cleopatra VII': { years: '69-30 BCE', bio: 'Last active ruler of the Ptolemaic Kingdom of Egypt' },
  'Julius Caesar': { years: '100-44 BCE', bio: 'Roman dictator who transformed the Republic' },
  'Leonardo da Vinci': { years: '1452-1519', bio: 'Renaissance polymath, painter, and inventor' },
  'Genghis Khan': { years: '1162-1227', bio: 'Founder of the Mongol Empire, largest contiguous land empire' },
  'Queen Elizabeth I': { years: '1533-1603', bio: 'Queen of England during the Elizabethan Golden Age' },
  'Napoleon Bonaparte': { years: '1769-1821', bio: 'French military leader who conquered much of Europe' },
  'Benjamin Franklin': { years: '1706-1790', bio: 'Founding Father, scientist, diplomat, and inventor' },
  'Marie Curie': { years: '1867-1934', bio: 'Pioneer of radioactivity research, first woman to win a Nobel Prize' },
  'Nikola Tesla': { years: '1856-1943', bio: 'Inventor of alternating current and visionary electrical engineer' },
  'Mahatma Gandhi': { years: '1869-1948', bio: 'Leader of Indian independence through nonviolent resistance' },
  'Albert Einstein': { years: '1879-1955', bio: 'Physicist who developed the theory of relativity' },
  'Ada Lovelace': { years: '1815-1852', bio: 'Mathematician and first computer programmer' },
};

const figuresChatSchema = z.object({
  figureName: z.string().min(1).max(100),
  messages: z.array(z.object({
    role: z.string(),
    content: z.string().max(4000),
  })).min(1).max(20),
});

export function registerFiguresRoutes(handleRoute: RouteHandler) {
  handleRoute('POST', '/api/figures/chat', null, async (body, _url, reqHeaders) => {
    if (!checkRateLimit('figures', getClientIP(reqHeaders || {}))) {
      return { status: 429, data: { error: 'Rate limit exceeded. Try again in a minute.' } };
    }
    const parsed = validate(figuresChatSchema, body);
    if (!parsed.success) return { status: 400, data: { error: parsed.error } };

    const { figureName, messages } = parsed.data;

    const figureInfo = FIGURE_DATA[figureName];
    if (!figureInfo) {
      return { status: 400, data: { error: 'Unknown historical figure.' } };
    }

    const ai = getProvider();
    const system = FIGURE_CHAT_SYSTEM(figureName, figureInfo.years, figureInfo.bio);
    const resp = await ai.chat(system, messages, { maxTokens: 1500 });

    return { status: 200, data: { content: resp.text } };
  });
}
