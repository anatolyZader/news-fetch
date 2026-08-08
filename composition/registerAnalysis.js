import { createReportReadPort } from '../business_modules/resilience_scorer/index.js';
import { createDefaultPboReportReviewService } from '../business_modules/pbo_report_review/index.js';
import { createPboHistoricalSearchService } from '../business_modules/pbo_report_review/app/pboHistoricalSearchService.js';
import { createMailingResendAdapter } from '../business_modules/mailing/infrastructure/adapters/mailingResendAdapter.js';
import { createMailingService } from '../business_modules/mailing/app/mailingService.js';
import { createDigestReportSource } from '../business_modules/mailing/app/digestReportSource.js';
import { getTranslatedReport } from '../business_modules/translation/app/translationService.js';
import { isMailingConfigured } from '../cross-cut-modules/config/mailingEnv.js';

/**
 * @param {object} opts
 * @param {string} opts.repoRoot
 * @param {string} opts.sqlitePath
 * @param {object} opts.evidenceStore
 * @param {object} opts.retrievalService
 * @param {object} opts.poolService
 */
export function registerAnalysis(opts) {
  const reportReadPort = createReportReadPort();

  const mailingService = isMailingConfigured()
    ? createMailingService({
      deliveryPort: createMailingResendAdapter({ apiKey: process.env.RESEND_API_KEY.trim() }),
      mailFrom: process.env.MAIL_FROM.trim(),
      getCachedReport: createDigestReportSource({ reportReadPort, evidenceStore: opts.evidenceStore }),
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
    mailingService,
    pboReportReviewService,
    pboHistoricalSearchService,
    isMailingConfigured,
  };
}
