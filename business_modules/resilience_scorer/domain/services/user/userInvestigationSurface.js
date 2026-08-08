/**
 * Track B — rich user investigation surface (full pool + hybrid narrative prose).
 *
 * Pipeline position: assessment finalize when RESILIENCE_USER_SURFACE=rich;
 * runs before userNarrativeSurface; scoring may abstain but surface must not starve.
 *
 * Owns: per-component investigation pool, epistemic role labels, highlighted evidence
 * from pool, deterministic claim-section narrative fallback.
 * Does NOT: overwrite hybrid LLM narrative_user, run LLM calls, or score components.
 *
 * Key collaborators: `user/evidenceFormatting.js`, `user/topContributors.js`,
 * `signals/componentSignalGroups.js`, `contracts/userSurfaceMode.js`.
 */

import {
  groupPoolItemsBySource,
  normalizePoolSourceType,
} from '../../contracts/evidencePoolGrouping.js';
import {
  userEvidenceChars,
  userHighlightPerSource,
  userSurfaceMode,
} from '../../contracts/userSurfaceMode.js';
import { collectComponentSignals } from '../signals/componentSignalGroups.js';
import { contributorRankKey } from './topContributors.js';
import {
  canonicalizeSignalType,
  getRoutingRole,
  getSignalCatalogEntry,
  isPrimaryEdge,
} from '../signals/routing/signalRouter.js';
import { SIGNAL_PROVENANCE } from '../signals/evidenceEligibility.js';
import { buildRefKey } from '../narrative/signalRefRegistry.js';
import {
  comparePoolItems,
  comparePoolItemsForDisplay,
  inferredPoolRenderMode,
  routingLabelSuffix,
} from './evidenceFormatting.js';

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

// ── Epistemic role assignment ─────────────────────────────────────────────────

/**
 * Assign user epistemic role for a signal relative to scoring/quarantine sets.
 *
 * @param {object} signal
 * @param {Set<object>} scoringSet
 * @param {Set<object>} quarantineSet
 * @returns {'scored' | 'context_only' | 'quarantined' | 'investigation_only'}
 */
export function assignUserEpistemicRole(signal, scoringSet, quarantineSet) {
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
 * Build one investigation-pool entry from a signal with clipped evidence.
 *
 * @param {object} signal
 * @param {'scored' | 'context_only' | 'quarantined' | 'investigation_only'} role
 * @param {number} maxChars
 * @param {string} [componentId] Stamps routing_role for the edge that routed here.
 * @returns {object|null}
 */
export function poolItemFromSignal(signal, role, maxChars, componentId) {
  const evidence = clipEvidence(signal, maxChars);
  if (!evidence) return null;
  const url = signal?.article_url;
  const cleanUrl = url && url !== '(no url)' && url !== 'null' ? url : null;
  const rawType = signal?.signal_type ?? signal?.type ?? null;
  const signalType = rawType ? canonicalizeSignalType(rawType) : null;
  return {
    ref: buildRefKey(signal),
    evidence,
    source_type: normalizePoolSourceType(signal?.source_type),
    article_source: signal?.article_source ?? null,
    url: cleanUrl,
    user_epistemic_role: role,
    signal_provenance: signal?.signalProvenance ?? null,
    signal_type: signalType,
    routing_role: componentId && signalType ? getRoutingRole(signalType, componentId) : null,
    construct_role: signalType ? (getSignalCatalogEntry(signalType)?.construct_role ?? null) : null,
  };
}

// ── Pool construction ─────────────────────────────────────────────────────────

/**
 * Build ranked investigation pool for one component from narrative-scope signals.
 *
 * @param {string} componentId
 * @param {object[]} narrativeScopeSignals
 * @param {object} ctx scoringSet, quarantineSet, maxChars.
 * @returns {object[]}
 */
export function buildComponentInvestigationPool(componentId, narrativeScopeSignals, ctx) {
  const {
    scoringSet = new Set(),
    quarantineSet = new Set(),
    maxChars = userEvidenceChars(),
  } = ctx;

  const { items } = collectComponentSignals(componentId, narrativeScopeSignals);

  const seenRefs = new Set();
  const pool = [];
  for (const item of items) {
    const signalType = item.signal?.signal_type ?? item.signal?.type;
    if (!isPrimaryEdge(signalType, componentId)) continue;
    const role = assignUserEpistemicRole(item.signal, scoringSet, quarantineSet);
    const entry = poolItemFromSignal(item.signal, role, maxChars, componentId);
    if (!entry || seenRefs.has(entry.ref)) continue;
    seenRefs.add(entry.ref);
    pool.push({ ...entry, contribution: contributorRankKey(item.signal, componentId) });
  }
  pool.sort(comparePoolItems);
  return pool;
}

// ── Deterministic narrative fallback ──────────────────────────────────────────

/**
 * Build sectioned prose from claims grouped by user_epistemic_role.
 *
 * @param {object[]} claims
 * @returns {string}
 */
export function buildDeterministicNarrativeFromClaims(claims) {
  if (!claims?.length) return '';

  /** @type {Record<string, object[]>} */
  const byRole = {};
  for (const claim of claims) {
    const role = claim.user_epistemic_role ?? 'investigation_only';
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

// ── Highlighted evidence ──────────────────────────────────────────────────────

/**
 * Pick per-source highlight bullets from investigation pool for user evidence list.
 *
 * @param {object[]} pool
 * @returns {object[]}
 */
export function buildHighlightedEvidenceFromPool(pool) {
  const perSource = userHighlightPerSource();
  const hideInferred = inferredPoolRenderMode() === 'hide';
  const bySource = groupPoolItemsBySource(pool);
  const highlighted = [];
  for (const { items } of bySource) {
    const eligible = hideInferred
      ? items.filter((item) => item.routing_role !== 'inferred')
      : items;
    const sorted = [...eligible].sort(comparePoolItems);
    // Selection stays contribution-ranked (comparePoolItems); only the picked
    // slice is re-ordered for display along the construct-role story arc.
    const picked = sorted.slice(0, perSource).sort(comparePoolItemsForDisplay);
    for (const item of picked) {
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

// ── Component / assessment attachment ─────────────────────────────────────────

/**
 * Attach investigation pool + highlights (never overwrites hybrid narrative_user).
 *
 * @param {object} comp
 * @param {object[]} pool
 */
export function attachRichInvestigationPool(comp, pool) {
  comp.user_surface_mode = 'rich';
  comp.user_investigation_pool = pool.map(stripContributionField);
  comp.user_investigation_pool_by_source = groupPoolItemsBySource(comp.user_investigation_pool);
  comp.user_surface_starved = pool.length === 0;
  comp.user_component_thin = isThinPool(pool);

  const highlighted = buildHighlightedEvidenceFromPool(pool);
  if (highlighted.length > 0) {
    comp.evidence_user_structured = highlighted;
    comp.evidence_user = highlighted.map((h) => h.markdown).filter(Boolean);
    comp.user_evidence_tier = 'rich_pool';
  }
}

/**
 * Attach rich investigation pools to all components when surface mode is rich.
 *
 * @param {object} assessment
 * @param {object} ctx narrativeScopeSignals, signalsForScoring, quarantinedSignals.
 * @returns {object}
 */
export function attachRichUserSurface(assessment, ctx) {
  if (userSurfaceMode() !== 'rich') return assessment;
  if (!assessment || typeof assessment !== 'object') return assessment;

  assessment.user_surface_mode = 'rich';

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
    maxChars: userEvidenceChars(),
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
