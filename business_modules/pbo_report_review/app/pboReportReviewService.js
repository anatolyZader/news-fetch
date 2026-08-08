/**
 * Orchestrates municipal PBO completeness review, email follow-ups, and reply ingestion.
 */
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';

import { writeFileAtomicSync } from '../../../cross-cut-modules/persistence/infrastructure/writeFileAtomic.js';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  reviewMunicipalityRow,
  supplementalTextsFromAnswers,
  deriveReviewStatus,
  GAP_KINDS,
} from '../domain/services/municipalCompleteness.js';
import { parseInboundEmailPayload } from '../domain/services/inboundEmailParser.js';
import {
  collectSupplementalTextsFromReplies,
  pboCompletenessLabel,
  reviewMetadataEntry,
  PBO_REVIEW_STATE,
} from '../domain/services/reviewSupplementalTexts.js';
import {
  buildBatchDocument,
  collectBatchRowQuestions,
  defaultBatchPath,
  defaultSendLogPath,
  selectMunicipalitiesToSend,
} from '../domain/services/pboReviewBatch.js';

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPO_ROOT = resolve(MODULE_ROOT, '../..');

function isReviewEnabled() {
  return process.env.PBO_REVIEW_ENABLED !== 'false';
}

/** When set, all PBO follow-up emails go here (testing override). */
function resolvePboReviewRecipient(officerEmail) {
  const testEmail = process.env.PBO_REVIEW_TEST_EMAIL?.trim();
  if (testEmail) return testEmail;
  return String(officerEmail ?? '').trim();
}

function applyEmailBodyToOpenGaps(supplementalTexts, openGaps) {
  if (!supplementalTexts._email_body || !openGaps.length) return supplementalTexts;
  const first = openGaps.find((g) => g.componentId) ?? openGaps[0];
  const next = { ...supplementalTexts };
  if (first?.componentId) {
    next[first.componentId] = next._email_body;
  }
  delete next._email_body;
  return next;
}

/**
 * Original PBO report fields for one municipality, as parsed from the Excel row.
 * @param {{ file?: string }} day dashboard day entry
 * @param {{ components?: object }} municipality
 * @param {string[]} componentsOrder
 * @param {Record<string, string>} componentNamesHe
 */
function rawReportForMunicipality(day, municipality, componentsOrder, componentNamesHe) {
  const components = {};
  for (const cid of componentsOrder) {
    const c = municipality.components?.[cid] ?? { avg: null, scores: [], texts: [] };
    components[cid] = {
      name: componentNamesHe?.[cid] ?? cid,
      avg: c.avg ?? null,
      scores: (c.scores ?? []).map((s) => ({ field: s.label ?? null, value: s.value })),
      texts: c.texts ?? [],
    };
  }
  return { sourceFile: day.file ?? null, components };
}

function loadBatchDocument(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    throw new Error(`failed to read batch ${path}: ${err?.message ?? err}`, { cause: err });
  }
}

/**
 * @returns {object|null} skip outcome, or null if the row may proceed
 */
function skipReasonForBatchSend(row, stored, force) {
  if (!stored) {
    return {
      municipality: row.municipality,
      emailSent: false,
      emailSkipped: true,
      emailError: 'review not found in store — run pbo:review-muni first',
    };
  }
  if (!force && stored.gapsHash && row.gapsHash && stored.gapsHash !== row.gapsHash) {
    return {
      municipality: row.municipality,
      emailSent: false,
      emailSkipped: true,
      emailError: `gapsHash mismatch (store=${stored.gapsHash} batch=${row.gapsHash})`,
    };
  }
  if (!force && stored.emailSentAt) {
    return {
      municipality: row.municipality,
      emailSent: false,
      emailSkipped: true,
      emailError: `already sent at ${stored.emailSentAt}`,
    };
  }
  return null;
}

/**
 * @param {object} deps
 * @param {import('../domain/ports/IPboReviewStorePort.js').IPboReviewStorePort} deps.reviewStore
 * @param {import('../domain/ports/IPboOfficerDirectoryPort.js').IPboOfficerDirectoryPort} deps.officerDirectory
 * @param {import('../domain/ports/IPboReviewMailPort.js').IPboReviewMailPort} [deps.mailPort]
 * @param {object} deps.evidenceRequirements
 * @param {() => object} deps.getMunicipalityDashboard
 * @param {boolean} [deps.mailingConfigured]
 * @param {string} [deps.auditJsonlPath]
 */
export function createPboReportReviewService(deps) {
  const {
    reviewStore,
    officerDirectory,
    mailPort = null,
    evidenceRequirements,
    getMunicipalityDashboard,
    mailingConfigured = false,
    auditJsonlPath = resolve(MODULE_ROOT, 'data', 'reviews', 'audit.jsonl'),
  } = deps;

  if (!reviewStore) throw new Error('reviewStore is required');
  if (!officerDirectory) throw new Error('officerDirectory is required');
  if (!evidenceRequirements) throw new Error('evidenceRequirements is required');
  if (!getMunicipalityDashboard) throw new Error('getMunicipalityDashboard is required');

  function appendAudit(entry) {
    try {
      mkdirSync(dirname(auditJsonlPath), { recursive: true });
      appendFileSync(auditJsonlPath, `${JSON.stringify({ ...entry, at: new Date().toISOString() })}\n`, 'utf8');
    } catch {
      /* non-critical */
    }
  }

  function buildReviewForMunicipality(day, municipality, supplementalTexts = {}) {
    const dashboard = getMunicipalityDashboard();
    const officer = officerDirectory.lookup(municipality.name);
    const language = officer?.language ?? 'he';
    const result = reviewMunicipalityRow(
      municipality,
      dashboard.componentsOrder,
      evidenceRequirements,
      dashboard.componentNames,
      language,
      { supplementalTexts },
    );
    const status = deriveReviewStatus(result.gaps, supplementalTexts);
    return {
      date: day.date,
      municipality: municipality.name,
      file: day.file,
      sufficient: result.sufficient,
      gaps: result.gaps,
      questions: result.questions,
      gapsHash: result.gapsHash,
      language,
      status,
    };
  }

  async function recomputeReview(date, municipalityName) {
    const dashboard = getMunicipalityDashboard();
    const day = dashboard.days.find((d) => d.date === date);
    if (!day) return null;
    const municipality = day.municipalities.find((m) => m.name === municipalityName);
    if (!municipality) return null;

    const replies = await reviewStore.listReplies(date, municipalityName);
    let supplementalTexts = collectSupplementalTextsFromReplies(replies);

    const openGaps = reviewMunicipalityRow(
      municipality,
      dashboard.componentsOrder,
      evidenceRequirements,
      dashboard.componentNames,
      'he',
    ).gaps;

    supplementalTexts = applyEmailBodyToOpenGaps(supplementalTexts, openGaps);

    const review = buildReviewForMunicipality(day, municipality, supplementalTexts);
    const existing = await reviewStore.getReview(date, municipalityName);
    return reviewStore.upsertReview({
      ...review,
      reviewToken: existing?.reviewToken,
      emailSentAt: existing?.emailSentAt,
      emailMessageId: existing?.emailMessageId,
    });
  }

  async function persistReviewWithExisting(review, existing) {
    return reviewStore.upsertReview({
      ...review,
      reviewToken: existing?.reviewToken,
      emailSentAt: existing?.emailSentAt,
      emailMessageId: existing?.emailMessageId,
    });
  }

  /**
   * @param {object} review
   * @param {object} stored
   * @param {{ email: string, language?: string }} officer
   * @param {Array<object>} [questions]
   */
  async function sendFollowUpEmail(review, stored, officer, questions) {
    if (!mailPort) {
      return { emailSent: false, emailSkipped: true, emailError: 'mail not configured', stored };
    }
    if (!officer?.email) {
      console.error(`[pbo-review] No officer email for ${review.municipality}, skipping send`);
      return { emailSent: false, emailSkipped: true, emailError: null, stored };
    }

    try {
      const recipient = resolvePboReviewRecipient(officer.email);
      const sendResult = await mailPort.sendMunicipalFollowUp({
        to: recipient,
        language: officer.language ?? review.language,
        date: review.date,
        municipality: review.municipality,
        questions: questions ?? review.questions,
        reviewToken: stored.reviewToken,
      });
      const updated = await reviewStore.upsertReview({
        ...review,
        questions: questions ?? review.questions,
        reviewToken: stored.reviewToken,
        emailSentAt: new Date().toISOString(),
        emailMessageId: sendResult?.id ?? null,
      });
      appendAudit({
        event: 'email_sent',
        date: review.date,
        municipality: review.municipality,
        gapsHash: review.gapsHash,
        to: recipient,
        officerEmail: officer.email,
      });
      return { emailSent: true, emailSkipped: false, emailError: null, stored: updated };
    } catch (err) {
      const emailError = err?.message ?? String(err);
      console.error(`[pbo-review] Email failed for ${review.municipality}:`, emailError);
      return { emailSent: false, emailSkipped: false, emailError, stored };
    }
  }

  async function reviewMunicipalityForDay(day, municipality, reviewDate, { force, dryRun }) {
    const existing = await reviewStore.getReview(reviewDate, municipality.name);
    const replies = await reviewStore.listReplies(reviewDate, municipality.name);
    const supplementalTexts = collectSupplementalTextsFromReplies(replies);
    const review = buildReviewForMunicipality(day, municipality, supplementalTexts);

    if (review.sufficient) {
      await persistReviewWithExisting(review, existing);
      return { municipality: municipality.name, sufficient: true, emailSent: false };
    }

    const sameHash = existing?.gapsHash === review.gapsHash && existing?.emailSentAt;
    const shouldSend = !dryRun && mailingConfigured && mailPort && (force || !sameHash);
    let stored = await persistReviewWithExisting(review, existing);

    let emailSent = false;
    let emailSkipped = false;
    let emailError = null;

    if (shouldSend) {
      const officer = officerDirectory.lookup(municipality.name);
      const sendOutcome = await sendFollowUpEmail(review, stored, officer, review.questions);
      emailSent = sendOutcome.emailSent;
      emailSkipped = sendOutcome.emailSkipped;
      emailError = sendOutcome.emailError;
    } else if (sameHash && !force) {
      emailSkipped = true;
    }

    return {
      municipality: municipality.name,
      sufficient: false,
      gapCount: review.gaps.length,
      emailSent,
      emailSkipped,
      emailError,
    };
  }

  return {
    isEnabled: isReviewEnabled,

    async reviewDay(date, { force = false, dryRun = false } = {}) {
      if (!isReviewEnabled()) {
        return { skipped: true, reason: 'PBO_REVIEW_ENABLED=false' };
      }

      const dashboard = getMunicipalityDashboard();
      const day = dashboard.days.find((d) => d.date === date);
      if (!day) {
        return { skipped: true, reason: 'no_day', date };
      }

      const results = [];
      for (const municipality of day.municipalities) {
        results.push(await reviewMunicipalityForDay(day, municipality, date, { force, dryRun }));
      }

      return { date, reviewed: results.length, results };
    },

    async listReviewsForDate(date) {
      return reviewStore.listReviewsForDate(date);
    },

    async getReviewDetail(date, municipality) {
      const review = await reviewStore.getReview(date, municipality);
      if (!review) return null;
      const replies = await reviewStore.listReplies(date, municipality);
      return { ...review, replies };
    },

    async submitWebReply(date, municipality, answers) {
      let review = await reviewStore.getReview(date, municipality);
      if (!review) {
        review = await recomputeReview(date, municipality);
        if (!review) throw new Error('Review not found');
      }

      await reviewStore.addReply({
        date,
        municipality,
        channel: 'web',
        answers: Array.isArray(answers) ? answers : [],
        rawText: '',
      });

      await recomputeReview(date, municipality);
      const detail = await reviewStore.getReview(date, municipality);
      const replies = await reviewStore.listReplies(date, municipality);
      return { ...detail, replies };
    },

    async handleInboundEmail(payload) {
      const parsed = parseInboundEmailPayload(payload);
      if (!parsed.reviewToken) {
        throw new Error('review token not found in inbound email');
      }
      const review = await reviewStore.getReviewByToken(parsed.reviewToken);
      if (!review) {
        throw new Error('unknown review token');
      }

      const openGaps = review.gaps.filter((g) => g.kind !== GAP_KINDS.sparse_row || !g.componentId);
      const firstGap = openGaps.find((g) => g.componentId) ?? openGaps[0];
      const answers = firstGap
        ? [{ gapId: firstGap.id, text: parsed.text }]
        : [{ gapId: 'email', text: parsed.text }];

      await reviewStore.addReply({
        date: review.date,
        municipality: review.municipality,
        channel: 'email',
        answers,
        rawText: parsed.text,
      });

      appendAudit({
        event: 'inbound_email',
        date: review.date,
        municipality: review.municipality,
        from: parsed.from,
      });

      return recomputeReview(review.date, review.municipality);
    },

    /**
     * Lookup review metadata for signal extraction.
     * @param {string} date
     * @param {string} municipality
     * @returns {Promise<object|null>}
     */
    async getSignalMetadata(date, municipality) {
      const review = await reviewStore.getReview(date, municipality);
      if (!review) return null;
      const replies = await reviewStore.listReplies(date, municipality);
      const supplementalTexts = collectSupplementalTextsFromReplies(replies);
      return reviewMetadataEntry(review, supplementalTexts);
    },

    async buildAssessmentSummary(date) {
      const reviews = await reviewStore.listReviewsForDate(date);
      const municipalities = reviews.map((r) => ({
        name: r.municipality,
        pbo_review_state: pboCompletenessLabel(r),
        pbo_review_status: r.status,
      }));
      return {
        date,
        incomplete_count: municipalities
          .filter((m) => m.pbo_review_state === PBO_REVIEW_STATE.reviewed_incomplete).length,
        municipalities,
      };
    },

    /**
     * Review all munis for a date (no mail) and write a user-revisable batch JSON.
     * @param {string} date YYYY-MM-DD
     * @param {{ outPath?: string, repoRoot?: string }} [opts]
     */
    async exportDayBatch(date, { outPath, repoRoot = DEFAULT_REPO_ROOT } = {}) {
      const reviewResult = await this.reviewDay(date, { dryRun: true });
      if (reviewResult.skipped) {
        return { skipped: true, reason: reviewResult.reason, date };
      }

      const reviews = await reviewStore.listReviewsForDate(date);
      const dashboard = getMunicipalityDashboard();
      const day = dashboard.days.find((d) => d.date === date);
      const rawByName = new Map((day?.municipalities ?? []).map((m) => [m.name, m]));
      const batch = buildBatchDocument({
        date,
        reviews,
        lookupOfficer: (name) => officerDirectory.lookup(name),
        lookupRawReport: (name) => {
          const muni = rawByName.get(name);
          if (!muni) return null;
          return rawReportForMunicipality(day, muni, dashboard.componentsOrder, dashboard.componentNames?.he);
        },
      });
      const path = outPath || defaultBatchPath(repoRoot, date);
      mkdirSync(dirname(path), { recursive: true });
      writeFileAtomicSync(path, `${JSON.stringify(batch, null, 2)}\n`);
      return {
        date,
        path,
        summary: batch.summary,
        results: reviewResult.results,
        batch,
      };
    },

    /**
     * Send feedback emails from a user-revised batch (does not recompute gaps).
     * @param {string} date YYYY-MM-DD
     * @param {{ batchPath?: string, repoRoot?: string, force?: boolean, dryRun?: boolean }} [opts]
     */
    async sendDayFeedback(date, {
      batchPath,
      repoRoot = DEFAULT_REPO_ROOT,
      force = false,
      dryRun = false,
    } = {}) {
      const path = batchPath || defaultBatchPath(repoRoot, date);
      const batch = loadBatchDocument(path);
      if (batch.date && batch.date !== date) {
        throw new Error(`batch date ${batch.date} does not match requested ${date}`);
      }

      if (!dryRun && (!mailingConfigured || !mailPort)) {
        throw new Error('mailing not configured (need RESEND_API_KEY + MAIL_FROM); use --dry-run to preview');
      }

      const selected = selectMunicipalitiesToSend(batch);
      const outcomes = [];

      for (const row of selected) {
        const stored = await reviewStore.getReview(date, row.municipality);
        const skip = skipReasonForBatchSend(row, stored, force);
        if (skip) {
          outcomes.push(skip);
          continue;
        }

        const officer = {
          email: String(row.officer?.email ?? '').trim(),
          language: row.officer?.language ?? row.language ?? stored.language ?? 'he',
        };
        const review = {
          ...stored,
          questions: collectBatchRowQuestions(row) ?? stored.questions,
          language: officer.language,
        };

        if (dryRun) {
          outcomes.push({
            municipality: row.municipality,
            emailSent: false,
            emailSkipped: false,
            dryRun: true,
            to: resolvePboReviewRecipient(officer.email),
            questionCount: review.questions?.length ?? 0,
          });
          continue;
        }

        const sendOutcome = await sendFollowUpEmail(review, stored, officer, review.questions);
        outcomes.push({
          municipality: row.municipality,
          emailSent: sendOutcome.emailSent,
          emailSkipped: sendOutcome.emailSkipped,
          emailError: sendOutcome.emailError,
          to: resolvePboReviewRecipient(officer.email),
        });
      }

      const logPath = defaultSendLogPath(path);
      const logDoc = {
        date,
        batchPath: path,
        dryRun,
        force,
        at: new Date().toISOString(),
        selected: selected.length,
        outcomes,
      };
      mkdirSync(dirname(logPath), { recursive: true });
      writeFileAtomicSync(logPath, `${JSON.stringify(logDoc, null, 2)}\n`);

      return {
        date,
        batchPath: path,
        logPath,
        dryRun,
        selected: selected.length,
        outcomes,
      };
    },

    recomputeReview,
    supplementalTextsFromAnswers,
  };
}
