import { createReportReadPort, resilienceReportsDir } from '../business_modules/resilience_scorer/index.js';
import {
  createValidationReviewSqliteStore,
  createValidationReviewService,
} from '../business_modules/resilience_scorer/analyst/index.js';
import {
  createCatalogProposalSqliteStore,
  createCatalogProposalService,
} from '../business_modules/signal_catalog_evolution/index.js';
import { createDefaultPboReportReviewService } from '../business_modules/pbo_report_review/index.js';
import { createPboHistoricalSearchService } from '../business_modules/pbo_report_review/app/pboHistoricalSearchService.js';
import { createMailingResendAdapter } from '../business_modules/mailing/infrastructure/adapters/mailingResendAdapter.js';
import { createMailingService } from '../business_modules/mailing/app/mailingService.js';
import { getTranslatedReport } from '../business_modules/translation/app/translationService.js';

function isMailingConfigured() {
  if (process.env.MAILING_ENABLED === 'false') return false;
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.MAIL_FROM?.trim();
  return Boolean(key && from);
}

/**
 * @param {object} opts
 * @param {string} opts.repoRoot
 * @param {string} opts.sqlitePath
 * @param {object} opts.evidenceStore
 * @param {object} opts.sourceArchive
 * @param {object} opts.retrievalService
 * @param {object} opts.poolService
 */
export function registerAnalysis(opts) {
  const catalogProposalStore = createCatalogProposalSqliteStore(opts.sqlitePath);
  const catalogProposalService = createCatalogProposalService({
    proposalStore: catalogProposalStore,
    retrievalService: opts.retrievalService,
  });

  const validationReviewStore = createValidationReviewSqliteStore(opts.sqlitePath);
  const validationReviewService = createValidationReviewService({
    store: validationReviewStore,
    evidenceStore: opts.evidenceStore,
    sourceArchive: opts.sourceArchive,
    retrievalService: opts.retrievalService,
    storyClusterIndex: opts.retrievalService.storyClusterIndex,
    reportsDir: resilienceReportsDir(opts.repoRoot),
  });

  const reportReadPort = createReportReadPort();

  const mailingService = isMailingConfigured()
    ? createMailingService({
      deliveryPort: createMailingResendAdapter({ apiKey: process.env.RESEND_API_KEY.trim() }),
      mailFrom: process.env.MAIL_FROM.trim(),
      getCachedReport: () => reportReadPort.getCachedReport(opts.evidenceStore),
      translateReport: getTranslatedReport,
      poolService: opts.poolService,
    })
    : null;

  const pboMailingDeliveryPort = isMailingConfigured()
    ? createMailingResendAdapter({ apiKey: process.env.RESEND_API_KEY.trim() })
    : null;

  const pboReportReviewService = createDefaultPboReportReviewService({
    repoRoot: opts.repoRoot,
    sqlitePath: opts.sqlitePath,
    mailingDeliveryPort: pboMailingDeliveryPort,
  });

  const pboHistoricalSearchService = createPboHistoricalSearchService({
    retrievalService: opts.retrievalService,
  });

  return {
    catalogProposalStore,
    catalogProposalService,
    validationReviewStore,
    validationReviewService,
    mailingService,
    pboReportReviewService,
    pboHistoricalSearchService,
    isMailingConfigured,
  };
}
