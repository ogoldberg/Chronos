/**
 * Citation Verifier
 *
 * Ensures citation URLs are real and clickable by:
 * 1. Constructing URLs from known patterns (Wikipedia, Wikidata) rather than trusting AI
 * 2. Verifying URL existence with a HEAD request
 * 3. Falling back to search URLs when direct links fail
 */

import type { Citation } from '../types';

const verifyCache = new Map<string, boolean>();

/**
 * Verify and fix citations for an event.
 * Replaces AI-generated URLs with constructed ones from known-good patterns.
 * Verifies Wikipedia links actually exist.
 */
export async function verifyCitations(
  citations: Citation[] | undefined,
  wikiTitle?: string,
): Promise<Citation[]> {
  if (!citations || citations.length === 0) {
    // If no citations but we have a wiki title, construct one
    if (wikiTitle) {
      const url = `https://en.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`;
      const exists = await verifyUrl(url);
      return [{
        source: 'Wikipedia',
        title: wikiTitle.replace(/_/g, ' '),
        url: exists ? url : `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(wikiTitle)}`,
      }];
    }
    return [];
  }

  const verified: Citation[] = [];
  for (const cite of citations) {
    const fixed = await fixCitation(cite);
    verified.push(fixed);
  }
  return verified;
}

async function fixCitation(cite: Citation): Promise<Citation> {
  // Construct URL from known patterns rather than trusting AI
  if (cite.source === 'Wikipedia' || cite.source === 'wikipedia') {
    const title = cite.title || '';
    const constructed = `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;
    const exists = await verifyUrl(constructed);
    return {
      ...cite,
      source: 'Wikipedia',
      url: exists
        ? constructed
        : `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(title)}`,
    };
  }

  if (cite.source === 'Wikidata' || cite.source === 'wikidata') {
    // Wikidata IDs are like Q12345
    const id = cite.title?.match(/Q\d+/)?.[0];
    return {
      ...cite,
      source: 'Wikidata',
      url: id ? `https://www.wikidata.org/wiki/${id}` : cite.url,
    };
  }

  // For other sources, if URL is provided, verify it exists
  if (cite.url) {
    const exists = await verifyUrl(cite.url);
    if (!exists) {
      // Fall back to a search if the specific URL is broken
      return {
        ...cite,
        url: `https://www.google.com/search?q=${encodeURIComponent(cite.title || cite.source)}`,
      };
    }
  }

  return cite;
}

async function verifyUrl(url: string): Promise<boolean> {
  if (verifyCache.has(url)) return verifyCache.get(url)!;

  try {
    const resp = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    const exists = resp.ok;
    verifyCache.set(url, exists);
    return exists;
  } catch {
    verifyCache.set(url, false);
    return false;
  }
}
