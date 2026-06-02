import { resolve } from 'node:path';
import { createDefaultPoolService } from '../business_modules/pool/index.js';
import {
  createPboRegionalDailyService,
  createPboReportRegionalFsAdapter,
} from '../business_modules/pbo_report_regional/index.js';
import { createVisitsFsAdapter, createVisitsService } from '../business_modules/visits/index.js';
import { createSocialMediaService } from '../business_modules/social_media/index.js';
import {
  createNewsSitesFsAdapter,
  createNewsSitesService,
} from '../business_modules/news-sites/index.js';
import {
  createRadioFsAdapter,
  createRadioIngestReadService,
} from '../business_modules/audio/index.js';
import {
  createReportBotManualReportsFsAdapter,
  createReportBotManualReportsService,
} from '../business_modules/report_bot/index.js';

/**
 * @param {{ repoRoot: string, retrievalService: object }} opts
 */
export function registerIngestion(opts) {
  const visitsService = createVisitsService({
    visitsRepository: createVisitsFsAdapter({
      rootDir: opts.repoRoot,
      reportsDir: resolve(opts.repoRoot, 'business_modules', 'visits', 'data'),
      signalsDir: resolve(opts.repoRoot, 'business_modules', 'visits', 'data', 'signals'),
    }),
  });

  const socialMediaService = createSocialMediaService({
    dataDir: resolve(opts.repoRoot, 'business_modules', 'social_media', 'data'),
    retrievalService: opts.retrievalService,
  });

  const newsSitesService = createNewsSitesService({
    repository: createNewsSitesFsAdapter({ rootDir: opts.repoRoot }),
    rootDir: opts.repoRoot,
  });

  const radioIngestReadService = createRadioIngestReadService({
    repository: createRadioFsAdapter({ rootDir: opts.repoRoot }),
    rootDir: opts.repoRoot,
  });

  const reportBotManualReportsService = createReportBotManualReportsService({
    repository: createReportBotManualReportsFsAdapter(),
  });

  const pboRegionalDailyService = createPboRegionalDailyService({
    repository: createPboReportRegionalFsAdapter(),
    rootDir: opts.repoRoot,
  });

  const poolService = createDefaultPoolService();

  return {
    visitsService,
    socialMediaService,
    newsSitesService,
    radioIngestReadService,
    reportBotManualReportsService,
    pboRegionalDailyService,
    poolService,
  };
}
