/**
 * Orchestrates municipal PBO completeness review, email follow-ups, and reply ingestion.
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  reviewMunicipalityRow,
  supplementalTextsFromAnswers,
  deriveReviewStatus,
  GAP_KINDS,
} from '../domain/services/municipalCompleteness.js';
import { parseInboundEmailPayload } from '../domain/services/inboundEmailParser.js';

const MODULE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function isReviewEnabled() {
  return process.env.PBO_REVIEW_ENABLED !== 'false';
}

/** When set, all PBO follow-up emails go here (testing override). */
function resolvePboReviewRecipient(officerEmail) {
  const testEmail = process.env.PBO_REVIEW_TEST_EMAIL?.trim();
  if (testEmail) return testEmail;
  return String(officerEmail ?? '').trim();
}

function collectSupplementalFromReplies(replies) {
  const merged = {};
  for (const reply of replies ?? []) {
    for (const ans of reply.answers ?? []) {
      const gapId = ans.gapId;
      const text = String(ans.text ?? '').trim();
      if (!text || !gapId.includes(':')) continue;
      const componentId = gapId.split(':')[0];
      if (!componentId) continue;
      merged[componentId] = merged[componentId] ? `${merged[componentId]} | ${text}` : text;
    }
    if (reply.rawText && reply.channel === 'email') {
      const fallback = String(reply.rawText).trim();
      if (fallback && !Object.keys(merged).length) {
        merged._email_body = fallback;
      }
    }
  }
  return merged;
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
    let supplementalTexts = collectSupplementalFromReplies(replies);

    const openGaps = reviewMunicipalityRow(
      municipality,
      dashboard.componentsOrder,
      evidenceRequirements,
      dashboard.componentNames,
      'he',
    ).gaps;

    if (supplementalTexts._email_body && openGaps.length) {
      const first = openGaps.find((g) => g.componentId) ?? openGaps[0];
      if (first?.componentId) {
        supplementalTexts[first.componentId] = supplementalTexts._email_body;
      }
      delete supplementalTexts._email_body;
    }

    const review = buildReviewForMunicipality(day, municipality, supplementalTexts);
    const existing = await reviewStore.getReview(date, municipalityName);
    return reviewStore.upsertReview({
      ...review,
      reviewToken: existing?.reviewToken,
      emailSentAt: existing?.emailSentAt,
      emailMessageId: existing?.emailMessageId,
    });
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
        const existing = await reviewStore.getReview(date, municipality.name);
        const replies = await reviewStore.listReplies(date, municipality.name);
        const supplementalTexts = collectSupplementalFromReplies(replies);
        const review = buildReviewForMunicipality(day, municipality, supplementalTexts);

        let emailSent = false;
        let emailSkipped = false;
        let emailError = null;

        if (review.sufficient) {
          await reviewStore.upsertReview({
            ...review,
            reviewToken: existing?.reviewToken,
            emailSentAt: existing?.emailSentAt,
            emailMessageId: existing?.emailMessageId,
          });
          results.push({ municipality: municipality.name, sufficient: true, emailSent: false });
          continue;
        }

        const sameHash = existing?.gapsHash === review.gapsHash && existing?.emailSentAt;
        const shouldSend = !dryRun && mailingConfigured && mailPort && (force || !sameHash);

        let stored = existing;
        if (!stored) {
          stored = await reviewStore.upsertReview(review);
        } else {
          stored = await reviewStore.upsertReview({
            ...review,
            reviewToken: existing.reviewToken,
            emailSentAt: existing.emailSentAt,
            emailMessageId: existing.emailMessageId,
          });
        }

        if (shouldSend) {
          const officer = officerDirectory.lookup(municipality.name);
          if (!officer?.email) {
            emailSkipped = true;
            console.error(`[pbo-review] No officer email for ${municipality.name}, skipping send`);
          } else {
            try {
              const recipient = resolvePboReviewRecipient(officer.email);
              const sendResult = await mailPort.sendMunicipalFollowUp({
                to: recipient,
                language: officer.language ?? review.language,
                date: review.date,
                municipality: review.municipality,
                questions: review.questions,
                reviewToken: stored.reviewToken,
              });
              stored = await reviewStore.upsertReview({
                ...review,
                reviewToken: stored.reviewToken,
                emailSentAt: new Date().toISOString(),
                emailMessageId: sendResult?.id ?? null,
              });
              emailSent = true;
              appendAudit({
                event: 'email_sent',
                date: review.date,
                municipality: review.municipality,
                gapsHash: review.gapsHash,
                to: recipient,
                officerEmail: officer.email,
              });
            } catch (err) {
              emailError = err?.message ?? String(err);
              console.error(`[pbo-review] Email failed for ${municipality.name}:`, emailError);
            }
          }
        } else if (sameHash && !force) {
          emailSkipped = true;
        }

        results.push({
          municipality: municipality.name,
          sufficient: false,
          gapCount: review.gaps.length,
          emailSent,
          emailSkipped,
          emailError,
        });
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
      const supplementalTexts = collectSupplementalFromReplies(replies);
      const pboCompleteness = review.sufficient || review.status === 'resolved' ? 'complete' : 'incomplete';
      return {
        pbo_completeness: pboCompleteness,
        pbo_review_status: review.status,
        pbo_evidence_thin: pboCompleteness === 'incomplete',
        supplementalTexts,
      };
    },

    async buildAssessmentSummary(date) {
      const reviews = await reviewStore.listReviewsForDate(date);
      const municipalities = reviews.map((r) => ({
        name: r.municipality,
        pbo_completeness: r.sufficient || r.status === 'resolved' ? 'complete' : 'incomplete',
        pbo_review_status: r.status,
      }));
      return {
        date,
        incomplete_count: municipalities.filter((m) => m.pbo_completeness === 'incomplete').length,
        municipalities,
      };
    },

    recomputeReview,
    supplementalTextsFromAnswers,
  };
}
