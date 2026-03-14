/**
 * Ynet-related source URIs from Event Registry suggestSources (ynet.co.il and .co.il subdomains).
 * Main site is "blog", subdomains can be "news" or "blog" – we request both via dataType.
 */
const YNET_SOURCE_URIS = [
  'ynet.co.il',
  'pplus.ynet.co.il',
  'livegame.ynet.co.il',
  'xnet.ynet.co.il',
  'yedioth.ynet.co.il',
  'z.ynet.co.il',
];

/** URL path segments that indicate non–main-news (sports, entertainment, lifestyle, etc.). */
const NON_NEWS_PATH_SEGMENTS = [
  '/sport',
  '/entertainment',
  '/food',
  '/activism',
  '/rechilut',
];

/**
 * Returns true if the article URL is main-news only (news, economy); excludes sports, entertainment, food, activism.
 * @param {string} url
 * @returns {boolean}
 */
function isMainNewsUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return !NON_NEWS_PATH_SEGMENTS.some((seg) => lower.includes(seg));
}

/**
 * Fetches articles from NewsAPI.ai (Event Registry) for ynet.co.il and its subdomains, Hebrew, for a given day.
 * Uses official API: dataType ["news","blog"] (ynet.co.il is blog), sourceUri array, dateStart/dateEnd YYYY-MM-DD.
 * When mainNewsOnly (default true), keeps only /news/ and /economy/ and excludes sports, entertainment, food, activism.
 * @param {{ apiKey: string, timezone?: string, mainNewsOnly?: boolean }} options
 * @returns {(opts: { date: string }) => Promise<Array<{ title: string, url: string, publishedAt: string, source: string }>>}
 */
export function createNewsApiArticlesFetcher(options) {
  const apiKey = options.apiKey;
  const mainNewsOnly = options.mainNewsOnly !== false;
  const baseUrl = 'https://eventregistry.org/api/v1/article/getArticles';
  const pageSize = 100;

  async function fetchArticlesForDay({ date }) {
    const all = [];
    let page = 1;
    let totalPages = 1;

    do {
      const body = {
        action: 'getArticles',
        resultType: 'articles',
        apiKey,
        sourceUri: YNET_SOURCE_URIS,
        lang: 'heb',
        dateStart: date,
        dateEnd: date,
        dataType: ['news', 'blog'],
        articlesPage: page,
        articlesCount: pageSize,
        articlesSortBy: 'date',
        articlesSortByAsc: false,
      };

      const res = await fetch(baseUrl, {
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
          source: a.source?.uri ?? a.source?.title ?? 'ynet.co.il',
        });
      }
      page += 1;
    } while (page <= totalPages);

    all.sort((a, b) => (a.publishedAt || '').localeCompare(b.publishedAt || ''));
    return all;
  }

  return fetchArticlesForDay;
}
