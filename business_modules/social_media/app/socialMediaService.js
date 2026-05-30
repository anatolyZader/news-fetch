import { createSocialMediaFsAdapter } from '../infrastructure/adapters/socialMediaFsAdapter.js';
import { createSocialMediaStubFetchAdapter } from '../infrastructure/adapters/socialMediaStubFetchAdapter.js';
import { createSocialMediaCompositeFetchAdapter } from '../infrastructure/adapters/socialMediaCompositeFetchAdapter.js';
import { createSocialMediaXFetchAdapter } from '../infrastructure/adapters/socialMediaXFetchAdapter.js';
import { createSocialMediaTelegramFetchAdapter } from '../infrastructure/adapters/socialMediaTelegramFetchAdapter.js';
import { createXApiClient } from '../infrastructure/adapters/xApiClient.js';
import { createTelegramMtprotoClientFromEnv } from '../infrastructure/adapters/telegramMtprotoClient.js';
import { createSocialMediaGatherService } from './socialMediaGatherService.js';
import { createSocialMediaTreatmentService } from './socialMediaTreatmentService.js';
import { createSocialMediaDailyFeedService } from './socialMediaDailyFeedService.js';
import { createSocialMediaTopicFetchService } from './socialMediaTopicFetchService.js';
import { createSocialMediaDailyGatherService } from './socialMediaDailyGatherService.js';

/**
 * @param {{
 *   persistencePort?: import('../domain/ports/ISocialMediaPersistencePort.js').ISocialMediaPersistencePort,
 *   fetchPort?: import('../domain/ports/ISocialMediaFetchPort.js').ISocialMediaFetchPort,
 *   dataDir?: string,
 *   xBearerToken?: string,
 *   telegramClient?: object | null,
 *   xFetchAdapter?: { fetchByTopic: Function } | null,
 *   telegramFetchAdapter?: { fetchByTopic: Function } | null,
 *   retrievalService?: object|null,
 * }} [opts]
 */
export function createSocialMediaService(opts = {}) {
  const persistencePort = opts.persistencePort ?? createSocialMediaFsAdapter({
    dataDir: opts.dataDir,
  });
  const dataDir = opts.dataDir ?? persistencePort.dataDir?.();

  const stubFetchAdapter = createSocialMediaStubFetchAdapter({ persistencePort });
  const bearerToken = opts.xBearerToken ?? process.env.X_BEARER_TOKEN ?? '';
  const xFetchAdapter = opts.xFetchAdapter ?? (bearerToken
    ? createSocialMediaXFetchAdapter({
      xApiClient: createXApiClient({ bearerToken }),
      persistencePort,
      dataDir,
    })
    : null);
  const telegramClient = opts.telegramClient ?? createTelegramMtprotoClientFromEnv();
  const telegramFetchAdapter = opts.telegramFetchAdapter ?? (telegramClient
    ? createSocialMediaTelegramFetchAdapter({
      telegramClient,
      persistencePort,
      dataDir,
    })
    : null);
  const fetchPort = opts.fetchPort ?? createSocialMediaCompositeFetchAdapter({
    xFetchAdapter,
    telegramFetchAdapter,
    stubFetchAdapter,
  });

  const gather = createSocialMediaGatherService({ persistencePort });
  const treatment = createSocialMediaTreatmentService({ persistencePort });
  const daily = createSocialMediaDailyFeedService({ persistencePort });
  const topic = createSocialMediaTopicFetchService({ persistencePort, fetchPort });
  const dailyGather = createSocialMediaDailyGatherService({
    persistencePort,
    gatherService: gather,
    treatmentService: treatment,
    xApiClient: bearerToken ? createXApiClient({ bearerToken }) : null,
    telegramFetchAdapter,
    dataDir,
    retrievalService: opts.retrievalService ?? null,
  });

  return {
    gather,
    treatment,
    daily,
    topic,
    dailyGather,
    persistence: persistencePort,

    async getDashboard() {
      const dates = persistencePort.listAvailableDates?.() ?? [];
      const entries = [];
      for (const date of dates) {
        const bundle = await persistencePort.loadBundle(date);
        if (!bundle) continue;
        entries.push({
          date,
          windowStart: bundle.window_start ?? null,
          windowEnd: bundle.window_end ?? null,
          windowDays: bundle.window_days ?? null,
          findingCount: bundle.findings?.length ?? 0,
          signalCount: bundle.signals?.length ?? 0,
          verifiedFindings: bundle.verified_findings ?? null,
          platforms: bundle.platforms_searched ?? [],
          hasReport: persistencePort.hasReport?.(date) ?? false,
          extractedAt: bundle.extracted_at ?? null,
          treatedAt: bundle.treated_at ?? null,
        });
      }
      return {
        dates: entries,
        storage: {
          dataDir: 'business_modules/social_media/data',
          jsonPattern: 'signals-social-YYYY-MM-DD.json',
          reportPattern: 'social-osint-report-YYYY-MM-DD.md',
        },
      };
    },

    async getReport(date) {
      const bundle = await persistencePort.loadBundle(date);
      if (!bundle) return null;
      const markdown = await persistencePort.loadReportMarkdown?.(date);
      return { bundle, markdown };
    },

    getPlatforms() {
      return topic.listPlatforms();
    },

    getDailyFeed(date, opts) {
      return daily.getDailyFeed(date, opts);
    },

    fetchByTopic(input) {
      return topic.fetchByTopic(input);
    },

    listTopicFetchHistory(limit) {
      return topic.listTopicFetchHistory(limit);
    },

    getTopicFetch(id, opts) {
      return topic.getTopicFetch(id, opts);
    },

    gatherDaily(input) {
      return dailyGather.gatherDaily(input);
    },
  };
}
