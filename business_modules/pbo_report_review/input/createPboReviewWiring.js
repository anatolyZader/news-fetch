/**
 * Shared DI wiring for PBO report review (app, CLI, assess-signals).
 */
import { resolve } from 'node:path';
import { getMunicipalityDashboard } from '../../pbo_report_muni/app/pboMunicipalityService.js';
import { EVIDENCE_REQUIREMENTS } from '../../report_build/domain/evidenceRequirements.js';
import { createMailingResendAdapter } from '../../mailing/infrastructure/adapters/mailingResendAdapter.js';
import { createPboReportReviewService } from '../app/pboReportReviewService.js';
import { createPboOfficerDirectoryJsonAdapter } from '../infrastructure/adapters/pboOfficerDirectoryJsonAdapter.js';
import { createPboReviewMailingAdapter } from '../infrastructure/adapters/pboReviewMailingAdapter.js';
import { createPboReviewSqliteStore } from '../infrastructure/adapters/pboReviewSqliteStore.js';

export function isPboReviewMailingConfigured() {
  if (process.env.MAILING_ENABLED === 'false') return false;
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.MAIL_FROM?.trim());
}

/**
 * @param {{ repoRoot: string, sqlitePath: string }} opts
 */
export function createDefaultPboReportReviewService({ repoRoot, sqlitePath }) {
  const mailingConfigured = isPboReviewMailingConfigured();
  let mailPort = null;
  if (mailingConfigured) {
    const deliveryPort = createMailingResendAdapter({ apiKey: process.env.RESEND_API_KEY.trim() });
    mailPort = createPboReviewMailingAdapter({
      deliveryPort,
      mailFrom: process.env.MAIL_FROM.trim(),
      appBaseUrl: process.env.APP_BASE_URL?.trim() || 'https://vibeswitch.ai',
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
 * Sync metadata map for signal extraction.
 * @param {string} date
 * @param {string} sqlitePath
 * @returns {Map<string, object>}
 */
export function loadReviewMetadataMapForDate(date, sqlitePath) {
  const store = createPboReviewSqliteStore(sqlitePath);
  const reviews = store.listReviewsForDate(date);
  const map = new Map();
  for (const review of reviews) {
    const replies = store.listReplies(date, review.municipality);
    const supplementalTexts = {};
    for (const reply of replies) {
      for (const ans of reply.answers ?? []) {
        const gapId = ans.gapId;
        const text = String(ans.text ?? '').trim();
        if (!text || !String(gapId).includes(':')) continue;
        const componentId = String(gapId).split(':')[0];
        if (!componentId) continue;
        supplementalTexts[componentId] = supplementalTexts[componentId]
          ? `${supplementalTexts[componentId]} | ${text}`
          : text;
      }
      if (reply.channel === 'email' && reply.rawText && !Object.keys(supplementalTexts).length) {
        supplementalTexts._email_body = reply.rawText;
      }
    }
    const pboCompleteness = review.sufficient || review.status === 'resolved' ? 'complete' : 'incomplete';
    map.set(review.municipality, {
      pbo_completeness: pboCompleteness,
      pbo_review_status: review.status,
      pbo_evidence_thin: pboCompleteness === 'incomplete',
      supplementalTexts,
    });
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
  const reviews = store.listReviewsForDate(date);
  for (const review of reviews) {
    if (review.status === 'resolved' || review.status === 'partially_resolved') return true;
    const replies = store.listReplies(date, review.municipality);
    if (replies.length > 0) return true;
  }
  return false;
}
