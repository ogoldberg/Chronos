import type { WikiData } from '../types';

const cache = new Map<string, WikiData | null>();

export async function fetchWikiSummary(title: string): Promise<WikiData | null> {
  if (cache.has(title)) return cache.get(title) ?? null;

  try {
    const resp = await fetch(
      `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`
    );
    if (!resp.ok) {
      cache.set(title, null);
      return null;
    }
    const data = await resp.json();
    const result: WikiData = {
      title: data.title,
      extract: data.extract,
      thumb: data.thumbnail?.source,
      url: data.content_urls?.desktop?.page,
    };
    cache.set(title, result);
    return result;
  } catch {
    cache.set(title, null);
    return null;
  }
}

