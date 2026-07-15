/**
 * Track B — rich operator investigation surface (full pool + hybrid narrative prose).
 * Product rule: scoring may abstain; operator surface must not starve.
 */
import {
  groupPoolItemsBySource,
  normalizePoolSourceType,
} from '../../contracts/evidencePoolGrouping.js';
import {
  operatorEvidenceChars,
  operatorHighlightPerSource,
  operatorSurfaceMode,
} from '../../contracts/operatorSurfaceMode.js';
import { buildDuplicateOccurrenceIndex } from '../../epistemic/massContribution.js';
import { collectComponentItems } from '../../epistemic/componentItems.js';
import { defaultSignalWeights } from '../signals/signalWeights.js';
import { getComponentWeight, getRoutingRole, hasStrongComponentLink } from '../signals/signalRouter.js';
import { SIGNAL_PROVENANCE } from '../signals/evidenceEligibility.js';
import { buildRefKey } from '../narrativeGrounding/signalRefRegistry.js';
import { comparePoolItems, inferredPoolRenderMode, routingLabelSuffix } from './routingLabel.js';

const CONTEXT_PROVENANCES = new Set([
  SIGNAL_PROVENANCE.macro_national,
  SIGNAL_PROVENANCE.narrative_national_context,
  SIGNAL_PROVENANCE.regional_press_context,
]);

const ROLE_ORDER = ['scored', 'investigation_only', 'quarantined', 'context_only'];

function roleSectionPrefix(role) {
  if (role === 'context_only') {
    return '**National or regional context (not local scored evidence):** ';
  }
  if (role === 'quarantined') {
    return '**Quarantined sources (verify independently):** ';
  }
  return '';
}

function stripContributionField(item) {
  const { contribution: _contribution, ...rest } = item;
  return rest;
}

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
 * @param {string} [componentId] When given, stamps the routing rationale
 *   (routing_role/routing_weight) for the edge that put this signal here.
 * @returns {object|null}
 */
export function poolItemFromSignal(signal, role, maxChars, componentId) {
  const evidence = clipEvidence(signal, maxChars);
  if (!evidence) return null;
  const url = signal?.article_url;
  const cleanUrl = url && url !== '(no url)' && url !== 'null' ? url : null;
  const signalType = signal?.signal_type ?? signal?.type ?? null;
  return {
    ref: buildRefKey(signal),
    evidence,
    source_type: normalizePoolSourceType(signal?.source_type),
    article_source: signal?.article_source ?? null,
    url: cleanUrl,
    operator_epistemic_role: role,
    signal_provenance: signal?.signalProvenance ?? null,
    signal_type: signalType,
    routing_role: componentId && signalType ? getRoutingRole(signalType, componentId) : null,
    routing_weight: componentId && signalType
      ? getComponentWeight(signalType, componentId) ?? null
      : null,
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
    const signalType = item.signal?.signal_type ?? item.signal?.type;
    if (!hasStrongComponentLink(signalType, componentId)) continue;
    const role = assignOperatorEpistemicRole(item.signal, scoringSet, quarantineSet);
    const entry = poolItemFromSignal(item.signal, role, maxChars, componentId);
    if (!entry || seenRefs.has(entry.ref)) continue;
    seenRefs.add(entry.ref);
    pool.push({ ...entry, contribution: Math.abs(item.contribution) });
  }
  pool.sort(comparePoolItems);
  return pool;
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
    const prefix = roleSectionPrefix(role);
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
  const hideInferred = inferredPoolRenderMode() === 'hide';
  const bySource = groupPoolItemsBySource(pool);
  const highlighted = [];
  for (const { items } of bySource) {
    const eligible = hideInferred
      ? items.filter((item) => item.routing_role !== 'inferred')
      : items;
    const sorted = [...eligible].sort(comparePoolItems);
    for (const item of sorted.slice(0, perSource)) {
      const rest = stripContributionField(item);
      const url = item.url;
      const base = url ? `- ${item.evidence} [source](${url})` : `- ${item.evidence}`;
      highlighted.push({
        ...rest,
        text: item.evidence,
        markdown: `${base}${routingLabelSuffix(item)}`,
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
 * Attach investigation pool + highlights only (never overwrites hybrid narrative_operator / claims).
 *
 * @param {object} comp
 * @param {object[]} pool
 */
export function attachRichInvestigationPool(comp, pool) {
  comp.operator_surface_mode = 'rich';
  comp.operator_investigation_pool = pool.map(stripContributionField);
  comp.operator_investigation_pool_by_source = groupPoolItemsBySource(comp.operator_investigation_pool);
  comp.operator_surface_starved = pool.length === 0;
  comp.operator_component_thin = isThinPool(pool);

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
    attachRichInvestigationPool(comp, pool);
  }

  return assessment;
}
