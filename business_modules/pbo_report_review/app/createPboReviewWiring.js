/**
 * Shared DI wiring for PBO report review (app, CLI, assess-signals).
 */
import { resolve } from 'node:path';
import { getMunicipalityDashboard } from '../../pbo_report/index.js';
import { EVIDENCE_REQUIREMENTS } from '../../report_build/index.js';
import { createPboReportReviewService } from '../app/pboReportReviewService.js';
import { createPboOfficerDirectoryJsonAdapter } from '../infrastructure/adapters/pboOfficerDirectoryJsonAdapter.js';
import { createPboReviewMailingAdapter } from '../infrastructure/adapters/pboReviewMailingAdapter.js';
import { createPboReviewSqliteStore } from '../infrastructure/adapters/pboReviewSqliteStore.js';
import {
  collectSupplementalTextsFromReplies,
  reviewMetadataEntry,
} from '../domain/services/reviewSupplementalTexts.js';

export function isPboReviewMailingConfigured() {
  if (process.env.MAILING_ENABLED === 'false') return false;
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.MAIL_FROM?.trim());
}

/**
 * @param {{ repoRoot: string, sqlitePath: string, mailingDeliveryPort?: import('../domain/ports/IMailingDeliveryPort.js').IMailingDeliveryPort }} opts
 */
export function createDefaultPboReportReviewService({ repoRoot, sqlitePath, mailingDeliveryPort = null }) {
  const mailingConfigured = isPboReviewMailingConfigured();
  let mailPort = null;
  if (mailingConfigured && mailingDeliveryPort) {
    mailPort = createPboReviewMailingAdapter({
      deliveryPort: mailingDeliveryPort,
      mailFrom: process.env.MAIL_FROM.trim(),
      appBaseUrl: process.env.APP_BASE_URL?.trim() || 'https://srulik.ai',
      inboundDomain: process.env.PBO_INBOUND_DOMAIN?.trim() || '',
    });
  }

  return createPboReportReviewService({
    reviewStore: createPboReviewSqliteStore(sqlitePath),
    officerDirectory: createPboOfficerDirectoryJsonAdapter({
      dataPath: resolve(repoRoot, 'business_modules/pbo_report_review/data/officers.json'),
    }),
    mailPort,
    evidenceRequirements: EVIDENCE_REQUIREMENTS,
    getMunicipalityDashboard,
    mailingConfigured,
    auditJsonlPath: resolve(repoRoot, 'business_modules/pbo_report_review/data/reviews/audit.jsonl'),
  });
}

/**
 * @param {import('../infrastructure/adapters/pboReviewSqliteStore.js').PboReviewSqliteStore} store
 * @param {string} date
 * @param {object} review
 */
function metadataForReview(store, date, review) {
  const replies = store.listReplies(date, review.municipality);
  const supplementalTexts = collectSupplementalTextsFromReplies(replies);
  return reviewMetadataEntry(review, supplementalTexts);
}

/**
 * Sync metadata map for signal extraction.
 * @param {string} date
 * @param {string} sqlitePath
 * @returns {Map<string, object>}
 */
export function loadReviewMetadataMapForDate(date, sqlitePath) {
  const store = createPboReviewSqliteStore(sqlitePath);
  const map = new Map();
  for (const review of store.listReviewsForDate(date)) {
    map.set(review.municipality, metadataForReview(store, date, review));
  }
  return map;
}

/**
 * Whether signal extraction should overwrite an existing bundle (replies or resolved reviews).
 * @param {string} date
 * @param {string} sqlitePath
 * @returns {boolean}
 */
export function shouldForcePboSignalRewrite(date, sqlitePath) {
  const store = createPboReviewSqliteStore(sqlitePath);
  for (const review of store.listReviewsForDate(date)) {
    if (review.status === 'resolved' || review.status === 'partially_resolved') return true;
    if (store.listReplies(date, review.municipality).length > 0) return true;
  }
  return false;
}
