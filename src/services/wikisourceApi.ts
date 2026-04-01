/**
 * Wikisource API client — fetch primary source documents
 * related to historical events.
 */

export interface SourceDocument {
  title: string;
  url: string;
  extract: string; // first ~500 chars
}

const cache = new Map<string, SourceDocument[] | null>();

/**
 * Search Wikisource for documents related to a query.
 */
export async function searchWikisource(query: string): Promise<SourceDocument[]> {
  if (cache.has(query)) return cache.get(query) ?? [];

  try {
    const resp = await fetch(
      `https://en.wikisource.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=5&format=json&origin=*`
    );
    if (!resp.ok) {
      cache.set(query, []);
      return [];
    }
    const data = await resp.json();
    const results: SourceDocument[] = (data.query?.search || []).map((item: any) => ({
      title: item.title,
      url: `https://en.wikisource.org/wiki/${encodeURIComponent(item.title)}`,
      extract: stripHtml(item.snippet || ''),
    }));
    cache.set(query, results);
    return results;
  } catch {
    cache.set(query, []);
    return [];
  }
}

/**
 * Get a specific Wikisource page extract.
 */
export async function getWikisourcePage(title: string): Promise<SourceDocument | null> {
  try {
    const resp = await fetch(
      `https://en.wikisource.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=extracts&exintro=1&explaintext=1&exsentences=5&format=json&origin=*`
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const pages = data.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0] as any;
    if (!page || page.missing !== undefined) return null;
    return {
      title: page.title,
      url: `https://en.wikisource.org/wiki/${encodeURIComponent(page.title)}`,
      extract: page.extract || '',
    };
  } catch {
    return null;
  }
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}
