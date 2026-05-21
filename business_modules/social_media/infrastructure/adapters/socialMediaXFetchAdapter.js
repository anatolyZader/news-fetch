import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildXTopicQueries,
  SOCIAL_MEDIA_X_LANGS,
  SOCIAL_MEDIA_X_QUERY_OPTS,
  topicSlug,
  xThreeDayWindow,
  xWindowBounds,
} from '../../domain/services/xTopicQueryBuilder.js';
import {
  candidateToPost,
  prefilterXSearchPayload,
  topXCandidatesByEngagement,
} from '../../domain/services/xCandidatePrefilter.js';

const COUNTS_COST = 0.005;
const POST_COST = 0.005;

function appendSpendLog(logPath, entry) {
  mkdirSync(resolve(logPath, '..'), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

/**
 * @param {{
 *   xApiClient: ReturnType<import('./xApiClient.js').createXApiClient>,
 *   persistencePort: import('../../domain/ports/ISocialMediaPersistencePort.js').ISocialMediaPersistencePort,
 *   dataDir?: string,
 *   defaultMaxPerQuery?: number,
 *   defaultMaxCostUsd?: number,
 * }} deps
 */
export function createSocialMediaXFetchAdapter({
  xApiClient,
  persistencePort,
  dataDir,
  defaultMaxPerQuery = 50,
  defaultMaxCostUsd = 2,
}) {
  if (!xApiClient) throw new Error('xApiClient is required');
  if (!persistencePort) throw new Error('persistencePort is required');

  const rootDataDir = dataDir ?? persistencePort.dataDir?.() ?? '';

  return {
    async fetchByTopic(opts) {
      const topic = String(opts?.topic ?? '').trim();
      const execute = Boolean(opts?.execute);
      const maxPerQuery = Math.min(Math.max(Number(opts?.maxPerQuery ?? defaultMaxPerQuery), 10), 100);
      const maxCostUsd = Number(opts?.maxCostUsd ?? defaultMaxCostUsd);
      const slug = topicSlug(topic);
      const { target, dates } = xThreeDayWindow();
      const { startTime, endTime } = xWindowBounds(dates);
      const queries = buildXTopicQueries(topic, [...SOCIAL_MEDIA_X_LANGS], SOCIAL_MEDIA_X_QUERY_OPTS);
      const langs = Object.keys(queries);
      const spendLogPath = resolve(rootDataDir, `x-spend-log-${target}-${slug}.jsonl`);

      /** @type {Array<{ lang: string, result_count: number }>} */
      const countRows = [];
      let countsCost = 0;

      for (const lang of langs) {
        const query = queries[lang];
        const body = await xApiClient.countsRecent({ query, startTime, endTime });
        const resultCount = body?.meta?.total_tweet_count ?? 0;
        countsCost += COUNTS_COST;
        countRows.push({ lang, result_count: resultCount });
        appendSpendLog(spendLogPath, {
          ts: new Date().toISOString(),
          endpoint: 'counts/recent',
          date: `${dates.at(-1)}..${dates[0]}`,
          lang,
          result_count: resultCount,
          est_cost_usd: COUNTS_COST,
        });
      }

      const projectedPosts = countRows.reduce((sum, row) => sum + Math.min(row.result_count, maxPerQuery), 0);
      const estPostCost = projectedPosts * POST_COST;
      let estTotalX = countsCost + estPostCost;

      const estimate = {
        countsCalls: countRows.length,
        totalCountsCost: countsCost,
        projectedPosts,
        estPostCost,
        estTotalX,
        byLang: countRows.map((row) => ({ lang: row.lang, total: row.result_count })),
        window: { startTime, endTime },
      };

      const accessNotes = [
        execute
          ? 'Live X API v2 search (/x-3 execute mode).'
          : 'Dry-run only (/x-3). Pass execute=true to fetch posts and spend search credits.',
      ];

      if (!execute) {
        return {
          posts: [],
          source: 'x_api_dry_run',
          mode: 'dry_run',
          accessNotes: [
            ...accessNotes,
            `Estimated X API cost if executed: $${estTotalX.toFixed(2)}.`,
          ],
          dryRun: { topic, slug, queries, estimate, dates },
        };
      }

      if (estTotalX > maxCostUsd) {
        throw new Error(
          `Estimated X API cost $${estTotalX.toFixed(2)} exceeds max $${maxCostUsd.toFixed(2)}. Raise maxCostUsd or narrow the topic.`,
        );
      }

      /** @type {object[]} */
      const allCandidates = [];
      let searchCost = 0;

      for (const lang of langs) {
        const slot = countRows.find((r) => r.lang === lang);
        if (!slot || slot.result_count <= 0) continue;

        const query = queries[lang];
        const raw = await xApiClient.searchRecent({
          query,
          startTime,
          endTime,
          maxResults: maxPerQuery,
        });
        const resultCount = raw?.data?.length ?? 0;
        searchCost += resultCount * POST_COST;

        const rawPath = resolve(rootDataDir, `x-raw-${dates[0]}-${lang}-${slug}.json`);
        mkdirSync(resolve(rawPath, '..'), { recursive: true });
        writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');

        appendSpendLog(spendLogPath, {
          ts: new Date().toISOString(),
          endpoint: 'search/recent',
          date: `${dates.at(-1)}..${dates[0]}`,
          lang,
          result_count: resultCount,
          est_cost_usd: resultCount * POST_COST,
        });

          allCandidates.push(...prefilterXSearchPayload(raw, { date: dates[0], lang }));
      }

      const topCandidates = topXCandidatesByEngagement(allCandidates, 60);
      const posts = topCandidates.map((c) => candidateToPost(c, topic));
      estTotalX = countsCost + searchCost;

      return {
        posts,
        source: 'x_api_v2',
        mode: 'execute',
        accessNotes: [
          ...accessNotes,
          `Fetched ${posts.length} posts from X (3-day window, ${langs.join('/')}).`,
          `Actual estimated X API spend: $${estTotalX.toFixed(2)}.`,
        ],
        dryRun: { topic, slug, queries, estimate, dates },
        estimate: {
          ...estimate,
          searchCost,
          estTotalX,
          postsFetched: allCandidates.length,
          postsReturned: posts.length,
        },
      };
    },
  };
}
