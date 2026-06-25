/**
 * Track B — rich operator investigation surface (deterministic, no specialists).
 * Product rule: scoring may abstain; operator surface must not starve.
 */
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import {
  groupPoolItemsBySource,
  normalizePoolSourceType,
} from '../../../../cross-cut-modules/resilience-contracts/evidencePoolGrouping.js';
import {
  operatorEvidenceChars,
  operatorHighlightPerSource,
  operatorMaxClaims,
  operatorSurfaceMode,
} from '../../../../cross-cut-modules/resilience-contracts/operatorSurfaceMode.js';
import { buildDuplicateOccurrenceIndex } from '../epistemic/massContribution.js';
import { collectComponentItems } from '../epistemic/componentItems.js';
import { defaultSignalWeights } from '../epistemic/signalWeights.js';
import { SIGNAL_PROVENANCE } from './evidenceEligibility.js';
import { buildRefKey } from './narrativeGrounding/signalRefRegistry.js';

function isStubClaimText(text) {
  const t = String(text ?? '').trim();
  if (!t) return true;
  if (t === 'Insufficient LLM synthesis — see supporting evidence below.') return true;
  return t.toLowerCase().includes('see supporting evidence below');
}

const CONTEXT_PROVENANCES = new Set([
  SIGNAL_PROVENANCE.macro_national,
  SIGNAL_PROVENANCE.narrative_national_context,
  SIGNAL_PROVENANCE.regional_press_context,
]);

const ROLE_ORDER = ['scored', 'investigation_only', 'quarantined', 'context_only'];

/**
 * @param {object} signal
 * @param {Set<object>} scoringSet
 * @param {Set<object>} quarantineSet
 * @returns {'scored' | 'context_only' | 'quarantined' | 'investigation_only'}
 */
export function assignOperatorEpistemicRole(signal, scoringSet, quarantineSet) {
  if (quarantineSet.has(signal)) return 'quarantined';
  const provenance = signal?.signalProvenance;
  if (CONTEXT_PROVENANCES.has(provenance) || signal?.metricsEligible === false
    || signal?.narrativeContextOnly === true) {
    return 'context_only';
  }
  if (scoringSet.has(signal)) return 'scored';
  return 'investigation_only';
}

/**
 * @param {object} signal
 * @param {number} maxChars
 * @returns {string}
 */
function clipEvidence(signal, maxChars) {
  return String(signal?.evidence ?? '').trim().slice(0, maxChars);
}

/**
 * @param {object} signal
 * @param {'scored' | 'context_only' | 'quarantined' | 'investigation_only'} role
 * @param {number} maxChars
 * @returns {object|null}
 */
export function poolItemFromSignal(signal, role, maxChars) {
  const evidence = clipEvidence(signal, maxChars);
  if (!evidence) return null;
  const url = signal?.article_url;
  const cleanUrl = url && url !== '(no url)' && url !== 'null' ? url : null;
  return {
    ref: buildRefKey(signal),
    evidence,
    source_type: normalizePoolSourceType(signal?.source_type),
    article_source: signal?.article_source ?? null,
    url: cleanUrl,
    operator_epistemic_role: role,
    signal_provenance: signal?.signalProvenance ?? null,
    signal_type: signal?.signal_type ?? signal?.type ?? null,
  };
}

/**
 * @param {string} componentId
 * @param {object[]} narrativeScopeSignals
 * @param {object} ctx
 * @returns {object[]}
 */
export function buildComponentInvestigationPool(componentId, narrativeScopeSignals, ctx) {
  const {
    scoringSet = new Set(),
    quarantineSet = new Set(),
    maxChars = operatorEvidenceChars(),
  } = ctx;

  const signalWeights = defaultSignalWeights();
  const duplicateIndex = buildDuplicateOccurrenceIndex(narrativeScopeSignals);
  const { items } = collectComponentItems(
    componentId,
    narrativeScopeSignals,
    duplicateIndex,
    signalWeights,
  );

  const seenRefs = new Set();
  const pool = [];
  for (const item of items) {
    const role = assignOperatorEpistemicRole(item.signal, scoringSet, quarantineSet);
    const entry = poolItemFromSignal(item.signal, role, maxChars);
    if (!entry || seenRefs.has(entry.ref)) continue;
    seenRefs.add(entry.ref);
    pool.push({ ...entry, contribution: Math.abs(item.contribution) });
  }
  return pool;
}

/**
 * @param {object[]} pool
 * @param {string} componentId
 * @returns {object[]}
 */
export function buildDeterministicClaimsFromPool(pool, componentId) {
  const maxClaims = operatorMaxClaims();
  const list = maxClaims > 0 ? pool.slice(0, maxClaims) : pool;
  return list.map((item) => ({
    text: item.evidence,
    signal_refs: [item.ref],
    operator_epistemic_role: item.operator_epistemic_role,
    relation: 'parallel',
    component_id: componentId,
  }));
}

/**
 * @param {object[]} claims
 * @returns {string}
 */
export function buildDeterministicNarrativeFromClaims(claims) {
  if (!claims?.length) return '';

  /** @type {Record<string, object[]>} */
  const byRole = {};
  for (const claim of claims) {
    const role = claim.operator_epistemic_role ?? 'investigation_only';
    if (!byRole[role]) byRole[role] = [];
    byRole[role].push(claim);
  }

  const sections = [];
  for (const role of ROLE_ORDER) {
    const group = byRole[role];
    if (!group?.length) continue;
    const prefix = role === 'context_only'
      ? '**National or regional context (not local scored evidence):** '
      : role === 'quarantined'
        ? '**Quarantined sources (verify independently):** '
        : '';
    const body = group.map((c) => String(c.text ?? '').trim()).filter(Boolean).join('\n\n');
    if (body) sections.push(prefix ? `${prefix}\n\n${body}` : body);
  }
  return sections.join('\n\n');
}

/**
 * @param {object[]} pool
 * @returns {object[]}
 */
export function buildHighlightedEvidenceFromPool(pool) {
  const perSource = operatorHighlightPerSource();
  const bySource = groupPoolItemsBySource(pool);
  const highlighted = [];
  for (const { items } of bySource) {
    const sorted = [...items].sort(
      (a, b) => (b.contribution ?? 0) - (a.contribution ?? 0),
    );
    for (const item of sorted.slice(0, perSource)) {
      const { contribution, ...rest } = item;
      const url = item.url;
      const md = url ? `- ${item.evidence} [source](${url})` : `- ${item.evidence}`;
      highlighted.push({
        ...rest,
        text: item.evidence,
        markdown: md,
      });
    }
  }
  return highlighted;
}

/**
 * @param {object[]} pool
 * @returns {boolean}
 */
function isThinPool(pool) {
  if (pool.length < 2) return true;
  const sources = new Set(pool.map((p) => p.source_type ?? 'other'));
  return sources.size < 2;
}

/**
 * @param {object} comp
 * @param {object[]} pool
 * @param {object[]} claims
 */
function applyRichComponentSurface(comp, pool, claims) {
  comp.operator_surface_mode = 'rich';
  comp.operator_investigation_pool = pool.map(({ contribution, ...rest }) => rest);
  comp.operator_investigation_pool_by_source = groupPoolItemsBySource(comp.operator_investigation_pool);
  comp.operator_surface_starved = pool.length === 0;
  comp.operator_component_thin = isThinPool(pool);

  const existingClaims = comp.narrative_claims ?? comp.claims ?? [];
  const hasUsableClaims = Array.isArray(existingClaims)
    && existingClaims.some((c) => c?.text && !isStubClaimText(c.text));
  if (!hasUsableClaims && claims.length > 0) {
    comp.narrative_claims = claims;
  }

  const existingNarrative = String(comp.narrative_operator ?? comp.narrative ?? '').trim();
  if (!existingNarrative || isStubClaimText(existingNarrative)) {
    const narrativeClaims = hasUsableClaims ? existingClaims : claims;
    const prose = buildDeterministicNarrativeFromClaims(
      narrativeClaims.map((c) => ({
        ...c,
        operator_epistemic_role: c.operator_epistemic_role
          ?? pool.find((p) => p.ref === (c.signal_refs ?? [])[0])?.operator_epistemic_role,
      })),
    );
    if (prose) comp.narrative_operator = prose;
  }

  const highlighted = buildHighlightedEvidenceFromPool(pool);
  if (highlighted.length > 0) {
    comp.evidence_operator_structured = highlighted;
    comp.evidence_operator = highlighted.map((h) => h.markdown).filter(Boolean);
    comp.operator_evidence_tier = 'rich_pool';
  }
}

/**
 * @param {object} assessment
 * @param {object} ctx
 * @returns {object}
 */
export function attachRichOperatorSurface(assessment, ctx) {
  if (operatorSurfaceMode() !== 'rich') return assessment;
  if (!assessment || typeof assessment !== 'object') return assessment;

  assessment.operator_surface_mode = 'rich';

  const {
    narrativeScopeSignals = [],
    signalsForScoring = [],
    quarantinedSignals = [],
  } = ctx;

  const scoringSet = new Set(signalsForScoring);
  const quarantineSet = new Set([
    ...quarantinedSignals,
    ...(ctx.scoringQuarantinedSignals ?? []),
  ]);

  const poolCtx = {
    scoringSet,
    quarantineSet,
    maxChars: operatorEvidenceChars(),
  };

  for (const comp of assessment.components ?? []) {
    if (!comp?.component_id) continue;
    const pool = buildComponentInvestigationPool(
      comp.component_id,
      narrativeScopeSignals,
      poolCtx,
    );
    const claims = buildDeterministicClaimsFromPool(pool, comp.component_id);
    applyRichComponentSurface(comp, pool, claims);
  }

  return assessment;
}
