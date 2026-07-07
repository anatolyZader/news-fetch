/**
 * Deterministic validation: narrative must comply when suppression trace applies.
 */

import { RESILIENCE_COMPONENTS } from '../../resilienceComponents.js';
import {
  componentNeedsSuppressionCompliance,
  caveatReferencesSuppressionReason,
} from './suppressionPromptContext.js';

const FORBIDDEN_PSYCH_PATTERNS = [
  /\bhidden\s+(anxiety|fear|pessimism|distress|worry)\b/i,
  /\bsuppressed\s+(pessimism|anxiety|fear|negativity)\b/i,
  /\bbeneath\s+the\s+surface\b/i,
  /\blatent\s+(fear|anxiety|distress|pessimism)\b/i,
  /\bunderlying\s+(distress|anxiety|fear|pessimism)\b/i,
  /\bunspoken\s+(fear|anxiety|distress)\b/i,
  /\bmasked\s+(fear|anxiety|distress)\b/i,
];

const BROAD_NEGATIVE_MOOD = [
  /\bwidespread\s+(despair|hopelessness|anxiety|fear|distress)\b/i,
  /\bdeep(-|\s)?seated\s+(fear|anxiety|pessimism)\b/i,
  /\bgeneral\s+(mood\s+of\s+)?(despair|hopelessness|anxiety)\b/i,
];

function hasNegativeEvidenceSignals(scored) {
  return (scored?.signals ?? []).some((s) => {
    if (s._polarity === '-') return true;
    const type = String(s.signal_type ?? s.type ?? '');
    return /negative|distress|fear|harm|despair|exhaustion|anxiety/i.test(type);
  });
}

function headlineSuppressedBelowRaw(scored) {
  const raw = scored?.score_raw;
  const headline = scored?.score_headline ?? scored?.score;
  if (raw == null || headline == null) return false;
  return raw > headline;
}

function netPositiveSignalStream(scored) {
  const pos = scored?.positive_evidence ?? 0;
  const neg = scored?.negative_evidence ?? 0;
  return pos > neg;
}

function narrativeHasForbiddenPsychSpeculation(narrative, scored) {
  const text = String(narrative ?? '');
  if (!text.trim()) return false;

  const suppressedBelowRaw = headlineSuppressedBelowRaw(scored);
  const netPositive = netPositiveSignalStream(scored);
  if (!suppressedBelowRaw && !netPositive) return false;

  for (const pattern of FORBIDDEN_PSYCH_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  if (!hasNegativeEvidenceSignals(scored)) {
    for (const pattern of BROAD_NEGATIVE_MOOD) {
      if (pattern.test(text)) return true;
    }
  }
  return false;
}

function narrativeContradictsCaveat(narrative, caveat, scored) {
  const narr = String(narrative ?? '').toLowerCase();
  const cav = String(caveat ?? '').toLowerCase();
  if (!narr.trim() || !cav.trim()) return false;

  const caveatMentionsCap = /source cap|single-source|outlet|concentration|dominant/.test(cav);
  if (!caveatMentionsCap) return false;
  if (hasNegativeEvidenceSignals(scored)) return false;

  for (const pattern of BROAD_NEGATIVE_MOOD) {
    if (pattern.test(narr)) return true;
  }
  return false;
}

/**
 * @param {object} compNarr
 * @param {object} scored
 */
export function validateComponentSuppressionCompliance(compNarr, scored) {
  const errors = [];
  if (!componentNeedsSuppressionCompliance(scored)) {
    return { ok: true, errors };
  }

  const caveat = compNarr?.data_quality_caveat ?? '';
  if (!String(caveat).trim()) {
    errors.push('data_quality_caveat required when SUPPRESSION_TRACE applies');
  } else if (!caveatReferencesSuppressionReason(caveat, scored)) {
    errors.push('data_quality_caveat must name the suppression reason (source cap, floor, dominant outlet, etc.)');
  }

  const narrative = compNarr?.narrative ?? '';
  if (narrativeHasForbiddenPsychSpeculation(narrative, scored)) {
    errors.push('narrative contains forbidden psych speculation to explain score suppression');
  }
  if (narrativeContradictsCaveat(narrative, caveat, scored)) {
    errors.push('narrative contradicts data_quality_caveat (broad negative mood without negative evidence)');
  }

  return { ok: errors.length === 0, errors };
}

/**
 * @param {object} narratives LLM output
 * @param {Record<string, object>} scoredComponents
 */
export function validateSuppressionCompliance(narratives, scoredComponents) {
  const errors = [];
  const warnings = [];

  for (const def of RESILIENCE_COMPONENTS) {
    const scored = scoredComponents[def.id] ?? {};
    if (!componentNeedsSuppressionCompliance(scored)) continue;

    const comp = (narratives.components ?? []).find((c) => c.component_id === def.id);
    if (!comp) {
      errors.push(`${def.id}: missing component block (suppression compliance required)`);
      continue;
    }

    const result = validateComponentSuppressionCompliance(comp, scored);
    for (const e of result.errors) {
      errors.push(`${def.id}: ${e}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}

/**
 * @param {{ errors: string[], warnings?: string[] }} result
 */
export function formatSuppressionFeedback(result) {
  if (!result?.errors?.length) return '';
  return `Suppression compliance errors:\n- ${result.errors.join('\n- ')}`;
}
