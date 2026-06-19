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
  const diversity = ep.source_diversity ?? null;

  let concentration;
  if (dominant) {
    concentration = 'rests on a single evidence channel';
  } else if (typeof diversity === 'number' && diversity > 1) {
    concentration = 'draws on multiple evidence channels';
  } else {
    concentration = 'rests on a limited evidence base';
  }

  const lead = `${label} ${concentration}.`;
  const caveat = qualityCaveat({
    contested: ep.contested === true,
    thin: ep.thin_evidence === true,
    dominant: dominant || concentration === 'rests on a limited evidence base',
  });

  return caveat ? `${lead} ${caveat}` : lead;
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
