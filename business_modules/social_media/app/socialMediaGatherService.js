import {
  CONTENT_KIND_OSINT,
  DEFAULT_PLATFORMS_SEARCHED,
  SOURCE_TYPE_SOCIAL,
} from '../domain/value_objects/socialPlatform.js';
import {
  buildDefaultGatherQueries,
  DEFAULT_ACCESS_LIMITATIONS,
} from '../domain/services/gatherQueryTemplates.js';
import { evaluateCitizenVoiceCandidate } from '../domain/services/osintRejectionRules.js';

/**
 * @param {{ persistencePort: import('../domain/ports/ISocialMediaPersistencePort.js').ISocialMediaPersistencePort }} deps
 */
export function createSocialMediaGatherService({ persistencePort }) {
  if (!persistencePort) throw new Error('socialMediaGatherService: persistencePort is required');

  return {
    /**
     * Create an empty OSINT bundle scaffold for a date window.
     * @param {{ date: string, windowDays?: number, localities?: string[] }} opts
     */
    createEmptyBundle({ date, windowDays = 7, localities } = {}) {
      if (!date) throw new Error('date is required');
      const end = new Date(`${date}T12:00:00Z`);
      const start = new Date(end);
      start.setUTCDate(start.getUTCDate() - (windowDays - 1));

      const queries = buildDefaultGatherQueries({ localities });

      return {
        source_type: SOURCE_TYPE_SOCIAL,
        content_kind: CONTENT_KIND_OSINT,
        date,
        window_days: windowDays,
        window_start: start.toISOString().slice(0, 10),
        window_end: end.toISOString().slice(0, 10),
        extracted_at: new Date().toISOString(),
        languages: ['he', 'ar', 'ru'],
        platforms_searched: [...DEFAULT_PLATFORMS_SEARCHED],
        queries_executed: 0,
        candidate_hits: 0,
        verified_findings: 0,
        low_confidence_findings: 0,
        rejected: {
          news_domain: 0,
          no_citizen_quote: 0,
          official_speaker: 0,
          not_public_or_login_required: 0,
          off_topic: 0,
        },
        access_limitations: [...DEFAULT_ACCESS_LIMITATIONS],
        gather_queries: queries,
        findings: [],
        rejected_examples: [],
        summary: null,
        signals: [],
      };
    },

    /**
     * Merge a verified finding into a bundle, updating counters.
     * @param {object} bundle
     * @param {object} finding
     */
    addFinding(bundle, finding) {
      const next = { ...bundle, findings: [...(bundle.findings ?? [])] };
      const verdict = evaluateCitizenVoiceCandidate(finding);
      if (!verdict.accepted) {
        next.rejected = { ...(next.rejected ?? {}) };
        const key = verdict.reason ?? 'off_topic';
        next.rejected[key] = (next.rejected[key] ?? 0) + 1;
        next.rejected_examples = [
          ...(next.rejected_examples ?? []),
          { url: finding.url, reason: key },
        ];
        return next;
      }

      next.findings.push(finding);
      next.verified_findings = next.findings.length;
      next.low_confidence_findings = next.findings.filter(
        (f) => String(f.confidence ?? '').includes('נמוכ') || String(f.confidence ?? '').toLowerCase() === 'low',
      ).length;
      return next;
    },

    /**
     * @param {string} date
     * @param {object} bundle
     */
    async saveBundle(date, bundle) {
      return persistencePort.saveBundle(date, bundle);
    },

    async loadBundle(date) {
      return persistencePort.loadBundle(date);
    },
  };
}
