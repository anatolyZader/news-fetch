/** Operator message when signals exist but LLM synthesis did not run. */
export const INSUFFICIENT_SYNTHESIS_NARRATIVE =
  'Insufficient LLM synthesis — see supporting evidence below.';

/**
 * Templates are for true empty/abstain only — not when investigation signals exist.
 * @param {object} ep
 * @param {number} [claimCount]
 * @returns {boolean}
 */
export function shouldAllowTemplateNarrative(ep, claimCount = 0) {
  const signalCount = ep.signal_count ?? claimCount ?? 0;
  return signalCount === 0;
}

/**
 * Deterministic narrative templates — readable English prose built from structured
 * epistemic facts (never raw evidence text). Used by the fallback/deterministic
 * assessment paths so reports stay readable even when the LLM agents do not run.
 * Verbatim, possibly multi-language, evidence quotes belong in the evidence tree,
 * not in the operator narrative.
 */

/**
 * @param {string} componentId
 * @returns {string} human label, first letter capitalized (e.g. "Functional continuity")
 */
function componentLabel(componentId) {
  const words = String(componentId ?? 'component').replaceAll('_', ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Name of the over-represented source family, if a source_type dominance warning
 * is present.
 * @param {object} ep epistemic profile slice for the component
 * @returns {string|null}
 */
function dominantSourceType(ep) {
  const warning = (ep?.dominance_warnings ?? []).find((w) => w?.layer === 'source_type');
  return warning?.key ?? null;
}

/**
 * Whether operator narrative should describe single-channel concentration.
 * Dominance alone is insufficient when diversity or investigation pool is rich.
 * @param {object} ep epistemic profile slice for the component
 * @returns {boolean}
 */
export function shouldUseSingleChannelNarrative(ep) {
  const diversity = ep?.source_diversity ?? 0;
  const investigationUsed = ep?.investigation_used ?? ep?.signal_count ?? 0;
  const hasDominance = (ep?.dominance_warnings ?? []).some((w) => w?.layer === 'source_type');
  if (!hasDominance) return false;
  if (diversity >= 2) return false;
  if (investigationUsed > 20) return false;
  return true;
}

/**
 * Quality caveat sentence from structured epistemic flags. Returns '' when the
 * evidence has no notable quality concern.
 * @param {{ contested: boolean, thin: boolean, dominant: boolean }} flags
 * @returns {string}
 */
function qualityCaveat({ contested, thin, dominant }) {
  if (contested && thin) {
    return 'Evidence is thin and contested across sources; treat as provisional.';
  }
  if (contested) {
    return 'Evidence is contested across sources; corroboration recommended.';
  }
  if (thin) {
    return 'Evidence is thin; treat as provisional.';
  }
  if (dominant) {
    return 'Treat as provisional pending corroboration.';
  }
  return '';
}

/**
 * Operator-register narrative: purely qualitative. No source_type slug, no raw
 * signal/source counts — those belong to the redacted instrument badges and the
 * analyst-only surfaces. Describes the evidence base in plain language only.
 * @param {string} label
 * @param {object} ep
 * @returns {string}
 */
function operatorNarrative(label, ep) {
  const dominant = dominantSourceType(ep) !== null;
  const singleChannel = shouldUseSingleChannelNarrative(ep);
  const diversity = ep.source_diversity ?? null;

  let concentration;
  if (singleChannel) {
    concentration = 'rests on a single evidence channel';
  } else if (dominant) {
    concentration = 'draws on multiple evidence channels with one source family over-represented';
  } else if (typeof diversity === 'number' && diversity > 1) {
    concentration = 'draws on multiple evidence channels';
  } else {
    concentration = 'rests on a limited evidence base';
  }

  const lead = `${label} ${concentration}.`;
  const caveat = qualityCaveat({
    contested: ep.contested === true,
    thin: ep.thin_evidence === true,
    dominant: singleChannel || dominant || concentration === 'rests on a limited evidence base',
  });

  return caveat ? `${lead} ${caveat}` : lead;
}

/**
 * Qualitative operator prose from epistemic profile only (no raw quotes).
 * @param {{ componentId: string, ep?: object }} params
 * @returns {string}
 */
export function buildOperatorQualitativeNarrative({ componentId, ep = {} }) {
  return operatorNarrative(componentLabel(componentId), ep);
}

/**
 * Analyst-register narrative: may name the dominant source family and counts.
 * @param {string} label
 * @param {object} ep
 * @param {number} signalCount
 * @returns {string}
 */
function analystNarrative(label, ep, signalCount) {
  const dominantSource = dominantSourceType(ep);
  const diversity = ep.source_diversity ?? null;

  let sourcePhrase = '';
  if (dominantSource) {
    sourcePhrase = ` concentrated in a single source family (${dominantSource})`;
  } else if (typeof diversity === 'number' && diversity > 1) {
    sourcePhrase = ` across ${diversity} source types`;
  }

  const lead = `${label}: ${signalCount} signal(s)${sourcePhrase}.`;
  const caveat = qualityCaveat({
    contested: ep.contested === true,
    thin: ep.thin_evidence === true,
    dominant: dominantSource !== null,
  });

  return caveat ? `${lead} ${caveat}` : lead;
}

/**
 * Build a concise, readable component narrative from structured facts only.
 * Operator view (default) is purely qualitative; analyst view may name the
 * dominant source family and counts.
 * @param {{ componentId: string, ep?: object, claimCount?: number, view?: 'operator'|'analyst' }} params
 * @returns {string}
 */
export function buildComponentNarrative({ componentId, ep = {}, claimCount = 0, view = 'operator' }) {
  const label = componentLabel(componentId);
  const signalCount = ep.signal_count ?? claimCount ?? 0;

  if (!signalCount) {
    return `${label}: no substantive signals today.`;
  }

  if (view !== 'analyst' && !shouldAllowTemplateNarrative(ep, claimCount)) {
    return INSUFFICIENT_SYNTHESIS_NARRATIVE;
  }

  return view === 'analyst'
    ? analystNarrative(label, ep, signalCount)
    : operatorNarrative(label, ep);
}

/**
 * Build an abstention narrative when a component cannot be assessed.
 * @param {string} componentId
 * @param {object} [ep]
 * @returns {string}
 */
export function buildAbstentionNarrative(componentId, ep = {}) {
  const label = componentLabel(componentId);
  if (ep.thin_evidence) {
    return `Insufficient evidence to assess ${label.toLowerCase()} today; assessment abstained pending corroboration.`;
  }
  return `Assessment abstained for ${label.toLowerCase()} today.`;
}

export { componentLabel };
