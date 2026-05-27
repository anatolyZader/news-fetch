import { SIGNAL_TYPES, INTENSITY_LEVELS, PHASE_LEVELS, AFFECTED_SUBGROUPS, AFFECTED_SYSTEMS, POLARITY_OVERRIDE_SIGNAL_TYPES, AFFECTED_SYSTEM_SIGNAL_TYPES } from '../domain/services/behaviorSignals.js';
import { bufferOovCapture, LEARNING_CAPTURE_KINDS } from '../domain/services/oovCapture.js';
import { parseFieldReportTitleLocality } from '../../../cross-cut-modules/geo/localityCandidate.js';

function normalizeEvidenceSpan(s, articles, sourceLabel) {
  const span = s.evidence_span;
  if (!span || typeof span !== 'object') return;
  const start = Number(span.start);
  const end = Number(span.end);
  const art = articles?.[s.article_index - 1];
  const bodyLen = art?.body?.length ?? 0;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > bodyLen) {
    delete s.evidence_span;
    if (bodyLen > 0) {
      console.error(`  ⚠ [${sourceLabel}] Dropped invalid evidence_span on [${s.signal_type}]`);
    }
  } else {
    s.evidence_span = { start, end };
  }
}

const VALID_EVIDENCE_TYPES = new Set([
  'direct_quote_named_person', 'named_survey_statistic',
  'named_institutional_fact', 'observational_reported_fact',
]);
const VALID_BASIS = new Set(['present_in_text', 'paraphrased', 'inferred_absence']);
const INDIVIDUAL_EMOTIONAL_SIGNAL_TYPES = new Set(['fear_expression', 'calm_confidence', 'child_distress']);
const VALID_INTENSITY = new Set(INTENSITY_LEVELS);
const VALID_PHASE = new Set(PHASE_LEVELS);
const VALID_SUBGROUP = new Set(AFFECTED_SUBGROUPS);
const VALID_AFFECTED_SYSTEM = new Set(AFFECTED_SYSTEMS);
const VALID_TYPES = new Set(SIGNAL_TYPES);

function dropUnknownSignalType(s, sourceLabel) {
  console.error(`  ⚠ [${sourceLabel}] Dropped unknown signal type: "${s.signal_type}"`);
  bufferOovCapture({
    capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
    suggested_type: s.signal_type,
    evidence: s.evidence ?? null,
    source_label: sourceLabel,
    article_index: s.article_index ?? null,
    timestamp: new Date().toISOString(),
  });
}

function passesEmotionalEvidenceGate(s, sourceLabel) {
  if (!INDIVIDUAL_EMOTIONAL_SIGNAL_TYPES.has(s.signal_type)) return true;
  if (s.evidence_type !== 'observational_reported_fact') return true;
  console.error(`  ⚠ [${sourceLabel}] Dropped emotional signal without named-person evidence: "${s.signal_type}"`);
  return false;
}

function normalizeExtractionConfidence(s) {
  if (typeof s.extraction_confidence !== 'number' || Number.isNaN(s.extraction_confidence)) {
    s.extraction_confidence = 0.85;
    return;
  }
  s.extraction_confidence = Math.min(1, Math.max(0, s.extraction_confidence));
}

function normalizeOptionalFields(s) {
  if (s.intensity != null && !VALID_INTENSITY.has(s.intensity)) delete s.intensity;
  if (s.phase != null && !VALID_PHASE.has(s.phase)) delete s.phase;
  if (s.affected_subgroup != null && !VALID_SUBGROUP.has(s.affected_subgroup)) {
    delete s.affected_subgroup;
  }
  if (s.affected_system != null) {
    const ok = AFFECTED_SYSTEM_SIGNAL_TYPES.has(s.signal_type) &&
      VALID_AFFECTED_SYSTEM.has(s.affected_system);
    if (!ok) delete s.affected_system;
  }
  if (s.polarity_override != null) {
    const ok = POLARITY_OVERRIDE_SIGNAL_TYPES.has(s.signal_type) &&
      (s.polarity_override === 'positive' || s.polarity_override === 'negative');
    if (!ok) delete s.polarity_override;
  }
}

function isValidSignalCandidate(s, sourceLabel) {
  if (!s || typeof s !== 'object') return false;
  if (!VALID_TYPES.has(s.signal_type)) {
    dropUnknownSignalType(s, sourceLabel);
    return false;
  }
  if (!VALID_EVIDENCE_TYPES.has(s.evidence_type)) {
    s.evidence_type = 'observational_reported_fact';
  }
  if (!VALID_BASIS.has(s.evidence_basis)) {
    s.evidence_basis = 'present_in_text';
  }
  if (!passesEmotionalEvidenceGate(s, sourceLabel)) return false;
  normalizeExtractionConfidence(s);
  normalizeOptionalFields(s);
  return true;
}

function enrichSignalFromArticle(s, art, contentKind) {
  s.article_source = art.source;
  s.temporal_weight = art.temporal_weight ?? 1;
  if (!art.title) return;
  s.article_title = art.title;
  if (contentKind === 'field_report') {
    const municipality = parseFieldReportTitleLocality(art.title);
    if (municipality) s.municipality = municipality;
  }
}

/**
 * Validates and normalises the signals array returned by a single Haiku call.
 */
export function validateSignalsFromCall(signals, articles, sourceLabel, contentKind = 'news') {
  const valid = signals.filter((s) => isValidSignalCandidate(s, sourceLabel));

  for (const s of valid) {
    const art = articles[s.article_index - 1];
    if (art) enrichSignalFromArticle(s, art, contentKind);
    normalizeEvidenceSpan(s, articles, sourceLabel);
  }

  return valid;
}
