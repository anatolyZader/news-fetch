import { evaluateCitizenVoiceCandidate } from './osintRejectionRules.js';
import { normalizeConfidence } from './findingToSignalMapper.js';

/**
 * @param {string} [postedAt]
 * @returns {string}
 */
export function findingDateFromPostedAt(postedAt) {
  const s = String(postedAt ?? '').trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return new Date().toISOString().slice(0, 10);
}

/**
 * @param {object} post normalized post from fetch layer
 * @param {object} [classified] LLM finding fields
 * @returns {object|null}
 */
export function postToOsintFinding(post, classified = {}) {
  const quote = String(classified.quote_original ?? post.text ?? '').trim();
  const finding = {
    id: String(classified.id ?? post.id ?? ''),
    date: String(classified.date ?? findingDateFromPostedAt(post.postedAt)),
    location: String(classified.location ?? post.location ?? 'לא ברור'),
    platform: String(classified.platform ?? post.platform ?? ''),
    source_kind: String(classified.source_kind ?? 'post'),
    url: String(classified.url ?? post.url ?? ''),
    quote_original: quote,
    quote_language: classified.quote_language ?? post.meta?.lang ?? 'he',
    quote_translation_he: classified.quote_translation_he ?? null,
    speaker_role: String(classified.speaker_role ?? post.authorRole ?? 'לא ברור'),
    behavior_or_emotion: String(classified.behavior_or_emotion ?? post.behaviorOrEmotion ?? ''),
    resilience_component: String(classified.resilience_component ?? 'narrative'),
    confidence: classified.confidence ?? post.confidence ?? 'בינונית',
    relevance_reason: String(classified.relevance_reason ?? ''),
    verification_notes: String(classified.verification_notes ?? ''),
  };

  const verdict = evaluateCitizenVoiceCandidate(finding);
  if (!verdict.accepted) {
    return { rejected: true, reason: verdict.reason ?? 'off_topic', finding };
  }
  return { rejected: false, finding };
}

/**
 * @param {object} bundle
 * @param {object[]} newFindings
 * @returns {object}
 */
export function mergeFindingsIntoBundle(bundle, newFindings) {
  const base = { ...bundle };
  const existing = Array.isArray(base.findings) ? [...base.findings] : [];
  const byId = new Map(existing.map((f) => [String(f.id), f]));

  const rejected = base.rejected ? { ...base.rejected } : {};
  const rejected_examples = base.rejected_examples ? [...base.rejected_examples] : [];

  for (const raw of newFindings ?? []) {
    const wrapped = raw?.quote_original && raw?.platform
      ? (() => {
        const verdict = evaluateCitizenVoiceCandidate(raw);
        if (!verdict.accepted) {
          return { rejected: true, reason: verdict.reason ?? 'off_topic', finding: raw };
        }
        return { rejected: false, finding: raw };
      })()
      : postToOsintFinding(raw);
    if (wrapped.rejected) {
      const reason = wrapped.reason ?? 'off_topic';
      rejected[reason] = (rejected[reason] ?? 0) + 1;
      if (wrapped.finding?.url) {
        rejected_examples.push({ url: wrapped.finding.url, reason });
      }
      continue;
    }
    const f = wrapped.finding;
    if (!f?.id || !f.quote_original) continue;
    byId.set(String(f.id), f);
  }

  const findings = [...byId.values()];
  const low = findings.filter((f) => normalizeConfidence(f.confidence) === 'low').length;

  return {
    ...base,
    findings,
    verified_findings: findings.length - low,
    low_confidence_findings: low,
    candidate_hits: (base.candidate_hits ?? 0) + (newFindings?.length ?? 0),
    extracted_at: new Date().toISOString(),
    rejected,
    rejected_examples,
  };
}

/**
 * @param {object|null} bundle
 * @param {string} [runDate] YYYY-MM-DD Jerusalem calendar day
 */
export function isBundleFreshForRun(bundle, runDate) {
  if (!bundle?.extracted_at) return false;
  const run = runDate ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const extractedDay = new Date(bundle.extracted_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  return extractedDay === run;
}

/**
 * Group findings by date field for per-day canonical bundles.
 * @param {object[]} findings
 * @returns {Map<string, object[]>}
 */
export function groupFindingsByDate(findings) {
  const map = new Map();
  for (const f of findings ?? []) {
    const d = String(f.date ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    const bucket = map.get(d) ?? [];
    bucket.push(f);
    map.set(d, bucket);
  }
  return map;
}
