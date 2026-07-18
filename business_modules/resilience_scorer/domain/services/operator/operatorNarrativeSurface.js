/**
 * Finalize operator-readable narrative + curated evidence on each component.
 * Deterministic only — no LLM calls.
 */
import { agentClaimsForComponent } from '../narrative/narrativeClaims.js';
import { resolveNarrativePipelineMode } from '../narrativeGrounding/groundingConfig.js';
import {
  buildRefKey,
  buildSignalRefRegistry,
} from '../narrativeGrounding/signalRefRegistry.js';
import { operatorMaxClaims } from '../../contracts/operatorSurfaceMode.js';
import {
  buildCitationRegistryFromStored,
  proseHasResolvableCitations,
  apaSourceFromSignalEntry,
} from '../../contracts/citationDisplay.js';
import {
  evidenceAnchorHref,
  evidenceAnchorId,
} from '../../contracts/evidenceAnchor.js';
import {
  linkPlainApaParentheticals,
  resolveInlineSignalCitations,
} from '../../contracts/inlineCitationResolve.js';
import { formatApaCitationDate } from '../../contracts/apaCitationFormat.js';
import { buildDeterministicNarrativeFromClaims } from './operatorInvestigationSurface.js';
import { getComponentWeight, getRoutingRole } from '../signals/signalRouter.js';
import {
  formatEvidenceBullet,
  isRichSurfaceMode,
  maxEvidenceLineChars,
  metaFromSignal,
  resolveSignalForRef,
  routingLabelSuffix,
  sourceMetaFromClaim,
  stripTrailingSignalRefs,
  urlFromClaim,
} from './evidenceFormatting.js';

export const INSUFFICIENT_SYNTHESIS_NARRATIVE =
  'Insufficient LLM synthesis — see supporting evidence below.';

const MAX_CLAIMS_IN_PROSE = 3;
const MAX_RICH_FALLBACK_CLAIMS = 12;

function maxClaimsInProse() {
  if (!isRichSurfaceMode()) return MAX_CLAIMS_IN_PROSE;
  const n = operatorMaxClaims();
  return n > 0 ? n : MAX_RICH_FALLBACK_CLAIMS;
}

/**
 * @param {object} comp
 * @returns {boolean}
 */
function hasHybridPolishedNarrative(comp) {
  const existing = String(comp?.narrative_operator ?? '').trim();
  if (!existing || isStubNarrative(existing)) return false;
  if (comp.narrative_grounding_score != null) return true;
  if (comp.narrative_pipeline_mode && comp.narrative_pipeline_mode !== 'legacy') return true;
  return existing.length > 80 && !existing.includes('avg=');
}

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
  const cap = maxClaimsInProse();
  const capped = (claims ?? [])
    .filter((c) => c?.text)
    .slice(0, cap);
  const texts = capped
    .map((c) => String(c?.text ?? '').trim())
    .filter(Boolean);
  if (texts.length === 0) return '';
  if (isRichSurfaceMode()) {
    return buildDeterministicNarrativeFromClaims(capped);
  }
  if (texts.length === 1) return texts[0];
  return texts.join(' Separately, ');
}

/**
 * @param {string} componentId
 * @returns {string}
 */
function claimsFromRichPool(comp) {
  const pool = comp.operator_investigation_pool ?? [];
  if (pool.length < 2) return [];

  const highlights = comp.evidence_operator_structured ?? [];
  const source = highlights.length > 0
    ? highlights
    : pool.slice(0, maxClaimsInProse());

  return source
    .map((item) => {
      const text = String(item.text ?? item.evidence ?? '').trim();
      if (!text) return null;
      const ref = item.ref ?? null;
      return {
        text,
        signal_refs: ref ? [ref] : [],
        relation: 'parallel',
      };
    })
    .filter(Boolean);
}

/**
 * @param {object} assessment
 * @returns {{ byLabel: Map<string, object> }|null}
 */
function citationRegistryFromAssessment(assessment) {
  const stored = assessment?.narrative_citation_registry?.entries;
  const fromStored = buildCitationRegistryFromStored(stored);
  if (fromStored) return fromStored;

  const scored = {};
  for (const comp of assessment?.components ?? []) {
    const signals = (comp.top_contributors ?? []).filter((s) => s?.evidence);
    if (signals.length > 0) {
      scored[comp.component_id] = { signals };
    }
  }
  if (Object.keys(scored).length === 0) return null;
  return buildSignalRefRegistry(scored);
}

function citationResolveOpts(componentId) {
  return {
    linked: true,
    linkMode: 'evidence',
    componentId,
    resolveMarkdown: true,
  };
}

/**
 * @param {string} prose
 * @param {string} ref
 * @param {string} componentId
 * @returns {boolean}
 */
function proseIncludesRef(prose, ref, componentId) {
  if (!prose || !ref) return false;
  if (prose.includes(ref)) return true;
  const anchor = evidenceAnchorId(componentId, ref);
  return prose.includes(anchor) || prose.includes(`#${anchor}`);
}

/**
 * @param {string} prose
 * @param {object} comp
 * @param {{ byRef?: Map<string, object> }} registry
 * @param {string|null|undefined} reportDate
 * @returns {string}
 */
function missingCitationForRef(prose, ref, registry, componentId, dateLabel) {
  if (proseIncludesRef(prose, ref, componentId)) return null;
  const entry = registry.byRef.get(ref);
  if (!entry) return null;
  const source = apaSourceFromSignalEntry(entry);
  if (!source?.author) return null;
  return {
    label: `${source.author}, ${dateLabel}`,
    markdown: `[${source.author}](${evidenceAnchorHref(componentId, ref)}), ${dateLabel}`,
  };
}

function syncMissingClaimCitations(prose, comp, registry, reportDate) {
  const componentId = comp?.component_id;
  const dateLabel = formatApaCitationDate(reportDate);
  if (!prose || !componentId || !dateLabel || !registry?.byRef?.size) return prose;

  // Dedup by visible label (author + date), not the full link string — anchors
  // differ per signal, so identical-looking labels would otherwise repeat.
  const missingByLabel = new Map();
  for (const claim of comp.narrative_claims ?? comp.claims ?? []) {
    for (const ref of claim.signal_refs ?? claim.evidence_refs ?? []) {
      const missing = missingCitationForRef(prose, ref, registry, componentId, dateLabel);
      if (missing && !missingByLabel.has(missing.label)) {
        missingByLabel.set(missing.label, missing.markdown);
      }
    }
  }
  if (missingByLabel.size === 0) return prose;
  const trimmed = prose.trim().replace(/\.\s*$/, '');
  return `${trimmed} (${[...missingByLabel.values()].join('; ')}).`;
}

function applyCitationResolverToField(text, registry, reportDate, componentId = null, comp = null) {
  const raw = String(text ?? '').trim();
  if (!raw || !registry) return raw;
  const needsResolve = proseHasResolvableCitations(raw)
    || (componentId && /\(.+,\s*\d{1,2}\s+[A-Za-z]{3}\s+\d{4}\)/.test(raw));
  if (!needsResolve && !comp) return raw;

  let out = raw;
  if (proseHasResolvableCitations(raw) || componentId) {
    out = resolveInlineSignalCitations(raw, registry, reportDate, citationResolveOpts(componentId));
  }
  if (componentId) {
    out = linkPlainApaParentheticals(out, registry, reportDate, componentId);
  }
  if (comp) {
    out = syncMissingClaimCitations(out, comp, registry, reportDate);
  }
  return out;
}

/**
 * @param {string} text
 * @param {{ byLabel?: Map<string, object>, byRef?: Map<string, object> }|null} registry
 * @param {string|null|undefined} reportDate
 * @param {string|null|undefined} componentId
 * @param {object|null|undefined} [comp]
 * @returns {string}
 */
export function resolveOperatorNarrativeCitations(text, registry, reportDate, componentId = null, comp = null) {
  return applyCitationResolverToField(text, registry, reportDate, componentId, comp);
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
 * @param {object} signal
 * @param {string|null|undefined} [fallbackText]
 * @returns {object|null}
 */
function structuredItemFromSignal(signal, fallbackText, refOverride = null, componentId = null) {
  const text = String(signal?.evidence ?? fallbackText ?? '').trim().slice(0, maxEvidenceLineChars());
  if (!text) return null;
  const meta = metaFromSignal(signal);
  const ref = refOverride ?? (signal ? buildRefKey(signal) : null);
  const signalType = signal?.signal_type ?? signal?.type ?? null;
  const item = {
    text,
    ref,
    source_type: meta.source_type,
    article_source: meta.article_source,
    url: meta.url,
    signal_type: signalType,
    routing_role: componentId && signalType ? getRoutingRole(signalType, componentId) : null,
    routing_weight: componentId && signalType
      ? getComponentWeight(signalType, componentId) ?? null
      : null,
  };
  item.markdown = `${formatEvidenceBullet(text, meta.url)}${routingLabelSuffix(item)}`;
  return item;
}

/**
 * @param {object} claim
 * @param {object} comp
 * @returns {object[]}
 */
function structuredItemsFromClaim(claim, comp) {
  const refs = claim.signal_refs ?? claim.evidence_refs ?? [];
  const fromRefs = refs
    .map((ref) => structuredItemFromSignal(resolveSignalForRef(ref, comp), null, ref, comp?.component_id))
    .filter(Boolean);
  if (fromRefs.length > 0) return fromRefs;

  const text = stripTrailingSignalRefs(claim.text).slice(0, maxEvidenceLineChars());
  if (!text) return [];
  const url = urlFromClaim(claim, comp);
  const meta = sourceMetaFromClaim(claim, comp);
  return [{
    text,
    source_type: meta.source_type,
    article_source: meta.article_source,
    url,
    markdown: formatEvidenceBullet(text, url),
  }];
}

/**
 * @param {object} comp
 * @returns {object[]}
 */
function buildEvidenceFromClaims(comp) {
  const claims = rawClaimsForComponent(comp).length > 0
    ? rawClaimsForComponent(comp)
    : claimsForComponent(comp);
  if (!claims.length) return [];
  return claims
    .flatMap((c) => structuredItemsFromClaim(c, comp));
}

/**
 * @param {object} comp
 * @returns {string[]}
 */
export function buildCuratedEvidenceBullets(comp) {
  if (isRichSurfaceMode() && Array.isArray(comp.evidence_operator_structured) && comp.evidence_operator_structured.length > 0) {
    return comp.evidence_operator_structured.map((item) => item.markdown).filter(Boolean);
  }

  if (Array.isArray(comp.evidence_operator) && comp.evidence_operator.length > 0) {
    return comp.evidence_operator;
  }

  const fromClaims = buildEvidenceFromClaims(comp);
  if (fromClaims.length > 0) {
    return fromClaims.map((item) => item.markdown).filter(Boolean);
  }

  const evidence = comp.evidence ?? [];
  if (Array.isArray(evidence) && evidence.length > 0) {
    return evidence
      .map((e) => {
        const text = typeof e === 'string' ? e : (e?.evidence ?? e?.text ?? '');
        return formatEvidenceBullet(text, null);
      })
      .filter(Boolean);
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
    return comp.evidence_operator_structured;
  }

  const fromClaims = buildEvidenceFromClaims(comp);
  if (fromClaims.length > 0) return fromClaims;

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
  if (fromClaims && !(isRichSurfaceMode() && fromClaims.includes('avg='))) {
    return fromClaims;
  }

  if (isRichSurfaceMode()) {
    const poolClaims = claimsFromRichPool(comp);
    if (poolClaims.length > 0) {
      const fromPool = buildDeterministicNarrativeFromClaims(poolClaims);
      if (fromPool) return fromPool;
    }
  }

  const ep = epistemicSliceFromComponent(comp);
  if ((ep.signal_count ?? 0) > 0) {
    return buildEpistemicOperatorProse(comp.component_id, ep);
  }

  return null;
}

/**
 * @param {object} comp
 */
function finalizeOperatorComponentSurface(comp) {
  const hasRichPool = isRichSurfaceMode()
    && Array.isArray(comp.operator_investigation_pool)
    && comp.operator_investigation_pool.length > 0;

  if (!hasHybridPolishedNarrative(comp)) {
    const narrative = resolveOperatorComponentNarrative(comp);
    if (narrative) {
      comp.narrative_operator = narrative;
    } else if (hasRichPool && isStubNarrative(comp.narrative_operator)) {
      delete comp.narrative_operator;
    }
  }

  const bullets = buildCuratedEvidenceBullets(comp);
  const structured = buildStructuredEvidenceItems(comp);
  if (bullets.length > 0 && comp.operator_evidence_tier !== 'rich_pool') {
    comp.evidence_operator = bullets;
    comp.evidence_operator_structured = structured;
    comp.operator_evidence_tier = 'curated';
  } else if (!hasRichPool && bullets.length === 0) {
    comp.operator_evidence_tier = 'none';
  }
}

/**
 * @param {object} assessment
 */
function applyCrossComponentSynthesisFallback(assessment) {
  if (assessment.cross_component_synthesis_operator) return;
  const synthesis = String(assessment.cross_component_synthesis ?? '').trim();
  if (synthesis) {
    assessment.cross_component_synthesis_operator = synthesis;
  }
}

function applyDegradedNarrativeCaveat(assessment) {
  if (assessment.narrative_pipeline_degraded !== true) return;

  const caveat =
    '**Narrative validation incomplete** — component prose may not meet grounding standards; '
    + 'prefer evidence_operator bullets and operator display states.\n\n';
  const existing = assessment.evidence_quality_note ?? '';
  if (!existing.includes('Narrative validation incomplete')) {
    assessment.evidence_quality_note = `${caveat}${existing}`;
  }
}

function applyCitationRegistryToAssessment(assessment, citationRegistry) {
  if (!citationRegistry) return;
  const reportDate = assessment.date;

  if (typeof assessment.cross_component_synthesis_operator === 'string') {
    assessment.cross_component_synthesis_operator = applyCitationResolverToField(
      assessment.cross_component_synthesis_operator,
      citationRegistry,
      reportDate,
    );
  }
  for (const comp of assessment.components ?? []) {
    if (typeof comp.narrative_operator === 'string') {
      comp.narrative_operator = applyCitationResolverToField(
        comp.narrative_operator,
        citationRegistry,
        reportDate,
        comp.component_id,
        comp,
      );
    }
  }
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

  applyDegradedNarrativeCaveat(assessment);

  for (const comp of assessment.components ?? []) {
    if (!comp || typeof comp !== 'object') continue;
    finalizeOperatorComponentSurface(comp);
  }

  applyCrossComponentSynthesisFallback(assessment);
  applyCitationRegistryToAssessment(assessment, citationRegistryFromAssessment(assessment));

  return assessment;
}
