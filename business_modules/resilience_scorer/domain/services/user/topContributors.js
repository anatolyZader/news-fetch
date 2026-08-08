/**
 * Count-based ranking of per-component top_contributors for assessment display.
 *
 * Pipeline position: evidence pipeline / narrative digest — ranks signals for
 * user evidence lists and digest caps.
 *
 * Owns: contributorRankKey sort key (primary edge, GROUNDING_TIER, evidence class).
 * Does NOT: compute numeric contribution mass or resilience scores.
 *
 * Key collaborators: `signals/routing/signalRouter.js`, `signals/groundingPolicy.js`,
 * `narrative/buildFullSignalDigest.js`, user narrative surface.
 */

import { isPrimaryEdge } from '../signals/routing/signalRouter.js';
import { GROUNDING_TIER } from '../signals/groundingPolicy.js';
import { CRITICAL_BYPASS_SIGNAL_TYPES } from '../../epistemic/highSalienceBypass.js';

const EVIDENCE_CLASS_RANK = {
  direct_quote_named_person: 4,
  named_survey_statistic: 4,
  named_institutional_fact: 3,
  direct_evidence: 3,
  observational_reported_fact: 2,
  observational_evidence: 2,
};

const INTENSITY_RANK = { severe: 2, moderate: 1, light: 0 };

/** Extraction confidence assumed when the extractor emitted none (mid-band). */
const DEFAULT_CONFIDENCE = 0.75;

/** How many contributors each component surfaces. */
export const TOP_CONTRIBUTOR_CAP = 15;

/** How many demoted rows each component surfaces; counts always report the true total. */
export const DEMOTED_EVIDENCE_CAP = 15;

// ── Ranking ───────────────────────────────────────────────────────────────────

/**
 * Composite sort key for count-based contributor ranking (higher = more salient).
 *
 * Band widths, widest first: grounding (100), criticality (50), evidence class
 * (10/step, max 40), intensity (2/step), primary edge (1), temporal (~0.15–3),
 * confidence (0–0.9). So a fresh signal outranks an equally-graded stale one but
 * never a higher evidence class or a grounded row; and a critical type — one that
 * `highSalienceBypass` says must not be suppressed when lone and verified —
 * outranks an ordinary same-tier row rather than losing an arbitrary tie to it.
 *
 * Criticality is deliberately capped below grounding: the highest score an
 * ungrounded row can reach is 50 + 40 + 4 + 1 + 3 + 0.9 = 98.9 < 100, so no
 * amount of salience promotes unverified evidence into this list. Unverified
 * evidence belongs in `demotedEvidenceFromScored`, labelled as such.
 *
 * Confidence sits below the primary-edge step on purpose: it can only separate
 * rows the documented ordering already calls equal, never invert that ordering.
 *
 * Every term must be able to vary in production. Confidence and criticality were
 * added because `slimSignal` dropped `evidence_type`/`temporal_weight` and pinned
 * `intensity`, leaving `grounded` as the only live term: all candidates tied, the
 * stable sort preserved input order, and the surface silently degraded to
 * "first N signals by article order" — alphabetical by municipality in practice.
 *
 * @param {object} signal
 * @param {string} componentId
 * @returns {number}
 */
export function contributorRankKey(signal, componentId) {
  const signalType = signal.signal_type ?? signal.type;
  const primaryEdge = isPrimaryEdge(signalType, componentId) ? 1 : 0;
  const grounded = signal.grounding_tier === GROUNDING_TIER.grounded ? 1 : 0;
  const critical = CRITICAL_BYPASS_SIGNAL_TYPES.has(signalType) ? 1 : 0;
  const evidenceClass = EVIDENCE_CLASS_RANK[signal.evidence_type ?? signal.evidence_class] ?? 2;
  const intensity = INTENSITY_RANK[signal.intensity] ?? 1;
  const confidence = typeof signal.confidence === 'number' ? signal.confidence : DEFAULT_CONFIDENCE;
  const temporal = (signal.temporal_weight ?? 1) * 3;
  return (
    grounded * 100 +
    critical * 50 +
    evidenceClass * 10 +
    intensity * 2 +
    primaryEdge +
    temporal +
    confidence * 0.9
  );
}

function hasStrongCatalogLink(signal, componentId) {
  const signalType = signal.signal_type ?? signal.type;
  return isPrimaryEdge(signalType, componentId);
}

// ── Top contributors list ─────────────────────────────────────────────────────

/**
 * Build ranked top_contributors array for one component from scored signals.
 *
 * @param {object} scored Evidence component with signals[].
 * @param {string} componentId
 * @returns {object[]}
 */
export function topContributorsFromScored(scored, componentId) {
  const pool = (scored?.signals ?? []).filter((s) => !isDemoted(s));
  const strong = pool.filter((s) => hasStrongCatalogLink(s, componentId));
  const ranked = (strong.length >= 3 ? strong : pool)
    .slice()
    .sort((a, b) => contributorRankKey(b, componentId) - contributorRankKey(a, componentId))
    .slice(0, TOP_CONTRIBUTOR_CAP);

  return ranked.map(displayRow);
}

/**
 * Verified and found wanting — as opposed to never verified.
 *
 * A missing `grounding_tier` means this signal's path never ran verification
 * (non-news ingest, synthetic signals); that is not a demotion and such rows
 * stay eligible for the contributor surface. Only an explicit below-grounded
 * tier moves a row to `demotedEvidenceFromScored`, and it belongs to exactly
 * one of the two surfaces so a reader never sees it counted twice.
 *
 * @param {object} signal
 * @returns {boolean}
 */
function isDemoted(signal) {
  const tier = signal?.grounding_tier;
  return tier != null && tier !== GROUNDING_TIER.grounded;
}

// ── Demoted evidence ──────────────────────────────────────────────────────────

/**
 * Signals held below the grounded tier, kept visible instead of dropped.
 *
 * These never enter the narrative — they failed verification against the source
 * text — but suppressing them entirely hides whole classes of evidence. A single
 * mistranslated extraction pass, for example, can push every compliance and
 * non-compliance signal in a report below the tier, leaving the life-saving
 * behaviour component showing no behaviour at all with nothing to say why.
 * `grounding_reason` is what makes the block readable: it separates "could not be
 * matched against the source text" from "verification actively failed".
 *
 * @param {object} scored Evidence component with signals[].
 * @param {string} componentId
 * @returns {{counts: object, excluded_from_narrative: boolean, items: object[]}|null}
 */
export function demotedEvidenceFromScored(scored, componentId) {
  const pool = scored?.signals ?? [];
  const demoted = pool.filter(isDemoted);
  if (demoted.length === 0) return null;

  const counts = {};
  const signalTypes = {};
  for (const s of demoted) {
    counts[s.grounding_tier] = (counts[s.grounding_tier] ?? 0) + 1;
    const t = s.signal_type ?? s.type;
    if (t) signalTypes[t] = (signalTypes[t] ?? 0) + 1;
  }

  // An uncapped type histogram is what makes a systemic gap legible: "every
  // compliance signal in this component is below the tier" is a different
  // statement from "some signals failed", and a capped sample cannot show it.
  const criticalSuppressed = [...new Set(
    demoted.map((s) => s.signal_type ?? s.type).filter((t) => CRITICAL_BYPASS_SIGNAL_TYPES.has(t)),
  )].sort();

  const items = demoted
    .slice()
    .sort((a, b) => contributorRankKey(b, componentId) - contributorRankKey(a, componentId))
    .slice(0, DEMOTED_EVIDENCE_CAP)
    .map(displayRow);

  return {
    counts,
    total: demoted.length,
    signal_types: signalTypes,
    critical_types_suppressed: criticalSuppressed,
    excluded_from_narrative: true,
    items,
  };
}

// ── Shared row shape ──────────────────────────────────────────────────────────

/**
 * Display row shared by the contributor and demoted surfaces.
 *
 * `evidence_type`, `confidence` and `grounding_reason` are carried so a reader can
 * weigh a row without reopening the source bundle — a named quote at 0.9 verified
 * by containment is not the same claim as an observational note at 0.65 rescued by
 * embedding similarity, and the row should say so.
 *
 * @param {object} s
 * @returns {object}
 */
function displayRow(s) {
  return {
    signal_type: s.signal_type ?? s.type ?? null,
    source_type: s.source_type ?? null,
    article_source: s.article_source ?? null,
    article_url: s.article_url ?? null,
    evidence: s.evidence ?? s.evidence_snippet ?? null,
    evidence_type: s.evidence_type ?? null,
    confidence: typeof s.confidence === 'number' ? s.confidence : null,
    grounding_tier: s.grounding_tier ?? null,
    grounding_reason: s.grounding_reason ?? null,
    intensity: s.intensity ?? null,
    _polarity: s._polarity ?? s.polarity ?? null,
  };
}
