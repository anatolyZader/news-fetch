/**
 * Finalize operator-readable narrative + curated evidence on each component.
 * Deterministic only — no LLM calls.
 */
import { agentClaimsForComponent } from './buildNarrativeScoredComponents.js';
import { resolveNarrativePipelineMode } from './narrativeGrounding/groundingConfig.js';

export const INSUFFICIENT_SYNTHESIS_NARRATIVE =
  'Insufficient LLM synthesis — see supporting evidence below.';

const MAX_CLAIMS_IN_PROSE = 3;
const MAX_EVIDENCE_BULLETS = 8;
const MAX_EVIDENCE_LINE_CHARS = 480;

/**
 * @param {string | null | undefined} text
 * @returns {boolean}
 */
export function isStubNarrative(text) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  if (t === INSUFFICIENT_SYNTHESIS_NARRATIVE) return true;
  return t.toLowerCase().includes('see supporting evidence below');
}

/**
 * @param {object[]} claims
 * @returns {string}
 */
export function buildProseFromClaims(claims) {
  const texts = (claims ?? [])
    .map((c) => String(c?.text ?? '').trim())
    .filter(Boolean)
    .slice(0, MAX_CLAIMS_IN_PROSE);
  if (texts.length === 0) return '';
  if (texts.length === 1) return texts[0];
  return texts.join(' Separately, ');
}

/**
 * @param {string} componentId
 * @returns {string}
 */
function componentLabel(componentId) {
  const words = String(componentId ?? 'component').replaceAll('_', ' ').trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Build qualitative operator prose from epistemic slice (no raw quotes).
 * @param {string} componentId
 * @param {object} ep
 * @returns {string}
 */
export function buildEpistemicOperatorProse(componentId, ep = {}) {
  const label = componentLabel(componentId);
  const signalCount = ep.signal_count ?? 0;
  if (!signalCount) {
    return `${label}: no substantive signals today.`;
  }

  const contested = ep.contested === true;
  const thin = ep.thin_evidence === true
    || ep.evidence_sufficiency === 'thin';
  const diversity = ep.source_diversity ?? null;

  let concentration;
  if (ep.source_diversity === 1 || ep.source_diversity == null) {
    concentration = 'rests on a limited evidence base';
  } else if (typeof diversity === 'number' && diversity > 1) {
    concentration = 'draws on multiple evidence channels';
  } else {
    concentration = 'rests on a limited evidence base';
  }

  let caveat = '';
  if (contested && thin) {
    caveat = 'Evidence is thin and contested across sources; treat as provisional.';
  } else if (contested) {
    caveat = 'Evidence is contested across sources; corroboration recommended.';
  } else if (thin) {
    caveat = 'Evidence is thin; treat as provisional.';
  }

  const lead = `${label} ${concentration}.`;
  return caveat ? `${lead} ${caveat}` : lead;
}

/**
 * @param {object} comp
 * @returns {object}
 */
function epistemicSliceFromComponent(comp) {
  const inst = comp.instrument ?? {};
  const coverage = comp.coverage ?? {};
  return {
    signal_count: inst.signal_count
      ?? coverage.investigation_used
      ?? coverage.scoring_used
      ?? comp.signal_count
      ?? 0,
    source_diversity: inst.source_diversity ?? null,
    contested: inst.contested === true || inst.contested_thin === true,
    thin_evidence: inst.evidence_sufficiency === 'thin',
    evidence_sufficiency: inst.evidence_sufficiency ?? null,
  };
}

/**
 * @param {object} comp
 * @returns {object[]}
 */
function claimsForComponent(comp) {
  const fromAgent = agentClaimsForComponent(comp);
  if (fromAgent.length > 0) return fromAgent;
  const raw = comp.narrative_claims ?? comp.claims ?? [];
  return Array.isArray(raw) ? raw.filter((c) => c?.text) : [];
}

/**
 * @param {string} refKey
 * @returns {string|null}
 */
const URL_FROM_REF_KEY = /@url:(.+)$/;

function urlFromRefKey(refKey) {
  const s = String(refKey ?? '');
  const match = URL_FROM_REF_KEY.exec(s);
  if (!match) return null;
  const url = match[1].trim();
  if (!url || url === '(no url)' || url === 'null') return null;
  return url;
}

/**
 * @param {object} claim
 * @returns {string|null}
 */
function urlFromClaim(claim) {
  const refs = claim.signal_refs ?? claim.evidence_refs ?? [];
  for (const ref of refs) {
    const url = urlFromRefKey(ref);
    if (url) return url;
  }
  return null;
}

/**
 * @param {string|null|undefined} sourceType
 * @returns {string|null}
 */
function normalizeSourceType(sourceType) {
  const st = String(sourceType ?? '').trim().toLowerCase();
  if (!st) return null;
  if (st === 'news' || st === 'press') return 'press';
  if (st === 'field' || st === 'visits') return 'field';
  return st;
}

/**
 * @param {object} claim
 * @param {object} comp
 * @returns {{ source_type: string|null, article_source: string|null }}
 */
function sourceMetaFromClaim(claim, comp) {
  if (claim?.source_type) {
    return {
      source_type: normalizeSourceType(claim.source_type),
      article_source: claim.article_source ?? null,
    };
  }
  const url = urlFromClaim(claim);
  const signalPools = [
    ...(comp?.signals ?? []),
    ...(comp?.top_contributors ?? []),
  ];
  for (const signal of signalPools) {
    if (url && signal?.article_url && signal.article_url === url) {
      return {
        source_type: normalizeSourceType(signal.source_type),
        article_source: signal.article_source ?? null,
      };
    }
  }
  if (url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, '');
      return { source_type: null, article_source: host || null };
    } catch {
      return { source_type: null, article_source: null };
    }
  }
  return { source_type: null, article_source: null };
}

/**
 * @param {string} text
 * @param {string|null} url
 * @returns {string}
 */
function formatEvidenceBullet(text, url) {
  const body = String(text ?? '').trim().slice(0, MAX_EVIDENCE_LINE_CHARS);
  if (!body) return '';
  if (url) return `- ${body} [source](${url})`;
  return `- ${body}`;
}

/**
 * @param {object} comp
 * @returns {string[]}
 */
export function buildCuratedEvidenceBullets(comp) {
  if (Array.isArray(comp.evidence_operator) && comp.evidence_operator.length > 0) {
    return comp.evidence_operator.slice(0, MAX_EVIDENCE_BULLETS);
  }

  const claims = claimsForComponent(comp);
  if (claims.length > 0) {
    const bullets = claims
      .map((c) => formatEvidenceBullet(c.text, urlFromClaim(c)))
      .filter(Boolean)
      .slice(0, MAX_EVIDENCE_BULLETS);
    if (bullets.length > 0) return bullets;
  }

  const evidence = comp.evidence ?? [];
  if (Array.isArray(evidence) && evidence.length > 0) {
    return evidence
      .map((e) => {
        const text = typeof e === 'string' ? e : (e?.evidence ?? e?.text ?? '');
        return formatEvidenceBullet(text, null);
      })
      .filter(Boolean)
      .slice(0, MAX_EVIDENCE_BULLETS);
  }

  return [];
}

/**
 * @param {object} comp
 * @returns {object[]}
 */
function rawClaimsForComponent(comp) {
  const raw = comp?.narrative_claims ?? comp?.claims ?? [];
  return Array.isArray(raw) ? raw.filter((c) => c?.text) : [];
}

/**
 * @param {object} comp
 * @returns {Array<{ text: string, source_type?: string|null, article_source?: string|null, url?: string|null, markdown?: string }>}
 */
export function buildStructuredEvidenceItems(comp) {
  if (Array.isArray(comp.evidence_operator_structured) && comp.evidence_operator_structured.length > 0) {
    return comp.evidence_operator_structured.slice(0, MAX_EVIDENCE_BULLETS);
  }

  const claims = rawClaimsForComponent(comp).length > 0
    ? rawClaimsForComponent(comp)
    : claimsForComponent(comp);
  if (claims.length > 0) {
    return claims
      .map((c) => {
        const text = String(c.text ?? '').trim().slice(0, MAX_EVIDENCE_LINE_CHARS);
        if (!text) return null;
        const url = urlFromClaim(c);
        const meta = sourceMetaFromClaim(c, comp);
        return {
          text,
          source_type: meta.source_type,
          article_source: meta.article_source,
          url,
          markdown: formatEvidenceBullet(c.text, url),
        };
      })
      .filter(Boolean)
      .slice(0, MAX_EVIDENCE_BULLETS);
  }

  return buildCuratedEvidenceBullets(comp).map((md) => ({
    text: String(md).replace(/^-\s*/, '').trim(),
    markdown: md,
  }));
}

/**
 * @param {object} comp
 * @returns {string|null}
 */
export function resolveOperatorComponentNarrative(comp) {
  const existing = String(comp.narrative_operator ?? '').trim();
  if (existing && !isStubNarrative(existing)) {
    return existing;
  }

  const agentNarrative = String(comp.narrative ?? '').trim();
  if (agentNarrative && !isStubNarrative(agentNarrative)) {
    return agentNarrative;
  }

  const claims = claimsForComponent(comp);
  const fromClaims = buildProseFromClaims(claims);
  if (fromClaims) return fromClaims;

  const ep = epistemicSliceFromComponent(comp);
  if ((ep.signal_count ?? 0) > 0) {
    return buildEpistemicOperatorProse(comp.component_id, ep);
  }

  return null;
}

/**
 * @param {object|null|undefined} assessment
 * @returns {object|null|undefined}
 */
export function finalizeOperatorNarrativeSurface(assessment) {
  if (!assessment || typeof assessment !== 'object') return assessment;

  if (!assessment.narrative_pipeline_mode) {
    assessment.narrative_pipeline_mode = resolveNarrativePipelineMode();
  }

  for (const comp of assessment.components ?? []) {
    if (!comp || typeof comp !== 'object') continue;

    const narrative = resolveOperatorComponentNarrative(comp);
    if (narrative) {
      comp.narrative_operator = narrative;
    }

    const bullets = buildCuratedEvidenceBullets(comp);
    const structured = buildStructuredEvidenceItems(comp);
    if (bullets.length > 0) {
      comp.evidence_operator = bullets;
      comp.evidence_operator_structured = structured;
      comp.operator_evidence_tier = 'curated';
    } else {
      comp.operator_evidence_tier = 'none';
    }
  }

  return assessment;
}
