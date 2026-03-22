/**
 * Shared factory for NewsAPI (Event Registry) article fetchers. Each site adapter
 * calls this with its sourceUris and defaultSourceLabel; filter is from mainNewsFilter.js.
 */
import { isMainNewsUrl } from '../../domain/mainNewsFilter.js';

const BASE_URL = 'https://eventregistry.org/api/v1/article/getArticles';
const PAGE_SIZE = 100;

/**
 * @param {{ apiKey: string, sourceUris: string[], defaultSourceLabel?: string, mainNewsOnly?: boolean }} options
 * @returns {(opts: { date: string }) => Promise<Array<{ title: string, url: string, publishedAt: string, source: string, body: string }>>}
 */
export function createNewsApiArticlesFetcher(options) {
  const apiKey = options.apiKey;
  const sourceUris = options.sourceUris;
  const defaultSourceLabel = options.defaultSourceLabel ?? sourceUris[0] ?? '';
  const mainNewsOnly = options.mainNewsOnly !== false;
  const lang = options.lang ?? 'heb';

  async function fetchArticlesForDay({ date }) {
    const all = [];
    let page = 1;
    let totalPages = 1;

    do {
      const body = {
        action: 'getArticles',
        resultType: 'articles',
        apiKey,
        sourceUri: sourceUris,
        lang,
        dateStart: date,
        dateEnd: date,
        dataType: ['news', 'blog'],
        articlesPage: page,
        articlesCount: PAGE_SIZE,
        articlesSortBy: 'date',
        articlesSortByAsc: false,
        articleBodyLen: -1,
      };

      const res = await fetch(BASE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = new Error(`NewsAPI.ai error: ${res.status}`);
        err.upstream = true;
        throw err;
      }

      const data = await res.json();
      const results = data?.articles?.results ?? [];
      totalPages = data?.articles?.pages ?? 1;

      for (const a of results) {
        const url = a.url ?? '';
        if (mainNewsOnly && !isMainNewsUrl(url)) continue;
        all.push({
          title: a.title ?? '',
          url,
          publishedAt: a.dateTime ?? a.date ?? '',
          source: a.source?.uri ?? a.source?.title ?? defaultSourceLabel,
          body: a.body ?? '',
        });
      }
      page += 1;
    } while (page <= totalPages);

    all.sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || ''));
    return all;
  }

  return fetchArticlesForDay;
}
