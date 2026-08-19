/**
 * Post-parse validation of narrative LLM JSON output (schema + grounding rules).
 *
 * Pipeline position: after facts/polish LLM parse — before persisting narrative;
 * post-hoc QA distinct from GROUNDING_TIER on signals.
 *
 * Owns: narrative_claims ref validation, connective checks, synthesis URL cap.
 * Does NOT: compute narrative_grounding_score (see sentenceGroundingChecker.js).
 *
 * Key collaborators: `coOccurrenceGraph.js`, `narrativeTextUtils.js`, `groundingConfig.js`,
 * RESILIENCE_COMPONENTS manifest strings.
 */

import { RESILIENCE_COMPONENTS } from '../../resilienceComponents.js';
import {
  EVIDENCE_OVERLAP_MIN,
  narrativeSynthesisMaxUrls,
} from './groundingConfig.js';
import { validateClaimRelation } from './coOccurrenceGraph.js';
import { resolveRef } from '../narrative/signalRefRegistry.js';
import { resolveClaimRef, CLAIM_REF_NAMESPACES } from '../narrative/claimRefNamespace.js';
import {
  bestEvidenceOverlap,
  findForbiddenConnectives,
  splitSentences,
  stripMarkdownLinks,
} from './narrativeTextUtils.js';

const VALID_RELATIONS = new Set(['parallel', 'same_article_only', 'none']);
const SIGNAL_LABEL_IN_PROSE = /\[S\d+\]/;
const INTERNAL_REF_IN_PROSE = /\[[^\]]+@(idx|url|file):[^\]]+\]/;

// ── Component validation (internal) ───────────────────────────────────────────

function warnSignalLabelsInProse(text, fieldName, warnings) {
  if (text && SIGNAL_LABEL_IN_PROSE.test(text)) {
    warnings.push(`${fieldName}: contains [S#] labels — use [source_label](url) in prose`);
  }
  if (text && INTERNAL_REF_IN_PROSE.test(text)) {
    warnings.push(`${fieldName}: contains internal signal_ref brackets — use (Field visit, date) or [hostname](url)`);
  }
}

/**
 * @param {object} comp
 * @param {object} def
 * @param {object} ctx
 */
/**
 * Unresolvable signal-namespace refs on one claim.
 *
 * Retrieval-chunk, OOV and open-observation citations are produced by the
 * evidence graph and are legitimately absent from the signal registry. Flagging
 * them as unknown was what exhausted the polish retry loop and degraded the
 * whole narrative pipeline — which in turn suppressed grounding QA.
 *
 * @param {string[]} refs
 * @param {object} registry
 * @returns {string[]}
 */
function unknownSignalRefs(refs, registry) {
  return refs.filter((ref) => {
    const resolution = resolveClaimRef(ref, { registry });
    return resolution.namespace === CLAIM_REF_NAMESPACES.SIGNAL && !resolution.resolved;
  });
}

function validateNarrativeClaims(comp, def, ctx) {
  const { errors, registry } = ctx;
  for (const claim of comp.narrative_claims ?? []) {
    if (!claim?.text) {
      errors.push(`${def.id}: narrative_claim missing text`);
      continue;
    }
    const refs = claim.signal_refs ?? [];
    if (refs.length === 0) {
      errors.push(`${def.id}: narrative_claim must cite ≥1 signal_ref`);
    }
    for (const ref of unknownSignalRefs(refs, registry)) {
      errors.push(`${def.id}: unknown signal_ref "${ref}"`);
    }
    const rel = claim.relation ?? 'parallel';
    if (!VALID_RELATIONS.has(rel)) {
      errors.push(`${def.id}: invalid relation "${rel}"`);
    }
    const relCheck = validateClaimRelation(refs, rel, registry);
    if (!relCheck.ok) {
      errors.push(`${def.id}: claim relation invalid (${relCheck.reason})`);
    }
  }
}

/**
 * @param {object} comp
 * @param {object} def
 * @param {object} ctx
 */
function validateNarrativeConnectives(comp, def, ctx) {
  const { errors, registry } = ctx;
  const narrative = comp.narrative ?? '';
  const connectives = findForbiddenConnectives(narrative);
  if (connectives.length > 0 && (comp.narrative_claims ?? []).some((c) =>
    (c.signal_refs ?? []).length > 1)) {
    const multiRef = (comp.narrative_claims ?? []).filter((c) => (c.signal_refs ?? []).length > 1);
    if (multiRef.some((c) => c.relation !== 'same_article_only')) {
      errors.push(`${def.id}: forbidden connective(s) with multi-ref claim: ${connectives.join(', ')}`);
    }
  }

  const refsInClaims = (comp.narrative_claims ?? []).flatMap((c) => c.signal_refs ?? []);
  for (const sentence of splitSentences(narrative)) {
    if (refsInClaims.length >= 2 && findForbiddenConnectives(sentence).length > 0) {
      const entries = refsInClaims.map((r) => resolveRef(r, registry)).filter(Boolean);
      const urls = new Set(entries.map((e) => e.signal?.article_url).filter(Boolean));
      if (urls.size > 1) {
        errors.push(`${def.id}: causal language in sentence linking unrelated sources`);
        break;
      }
    }
  }
}

function validateComponentEvidenceOverlap(comp, def, scored, signalCount, warnings) {
  const evidenceTexts = (scored.signals ?? []).map((s) => s.evidence ?? '');
  for (const evItem of comp.evidence ?? []) {
    const maxOverlap = bestEvidenceOverlap(stripMarkdownLinks(evItem), evidenceTexts);
    if (signalCount > 0 && maxOverlap < EVIDENCE_OVERLAP_MIN * 0.5) {
      warnings.push(`${def.id}: evidence item low overlap (${maxOverlap.toFixed(2)})`);
    }
  }
}

/**
 * @param {object | undefined} comp
 * @param {object} def
 * @param {object} ctx
 */
function validateResilienceComponent(comp, def, ctx) {
  const { errors, warnings, manifestMap, scoredComponents } = ctx;
  const scored = scoredComponents[def.id] ?? {};
  const signalCount = scored.signal_count ?? scored.signals?.length ?? 0;
  // Must be the set that went INTO polish, not the set that came out: `comp` is
  // looked up in the output list, so an output-derived flag is false by
  // construction inside `if (!comp)` and this error was unreachable from the day
  // the file was written. A polish shard that silently dropped a component
  // therefore validated clean, broke the retry loop, and fell to deterministic
  // fallback prose — north 2026-04-03 lost community_capital and leadership that way.
  const wasRequested = ctx.requestedComponentIds?.has(def.id) ?? false;

  if (!comp) {
    if (signalCount > 0 && wasRequested) {
      errors.push(`${def.id}: missing component block`);
    }
    return;
  }

  if (signalCount > 0 && (!Array.isArray(comp.evidence) || comp.evidence.length === 0)) {
    errors.push(`${def.id}: evidence[] required when signals present`);
  }

  for (const m of comp.manifestations_evidenced ?? []) {
    const allowed = manifestMap[def.id];
    if (allowed && !allowed.has(m)) {
      errors.push(`${def.id}: unknown manifestation_evidenced "${m}"`);
    }
  }

  validateNarrativeClaims(comp, def, ctx);
  validateComponentEvidenceOverlap(comp, def, scored, signalCount, warnings);
  validateNarrativeConnectives(comp, def, ctx);
  warnSignalLabelsInProse(comp.narrative ?? '', `${def.id}.narrative`, warnings);
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Validate parsed narrative LLM output against registry and catalog rules.
 *
 * @param {object} narratives Parsed LLM JSON.
 * @param {object} opts
 * @param {Record<string, object>} opts.scoredComponents
 * @param {{ byRef: Map<string, object> }} opts.registry
 * @param {Iterable<string>} [opts.requestedComponentIds] Components sent to polish.
 *   Omit to skip the missing-block check entirely (callers that do not shard).
 * @returns {{ ok: boolean, errors: string[], warnings: string[] }}
 */
export function validateNarrativeOutput(narratives, opts = {}) {
  const errors = [];
  const warnings = [];
  const { scoredComponents = {}, registry, requestedComponentIds = null } = opts;
  const manifestMap = Object.fromEntries(
    RESILIENCE_COMPONENTS.map((d) => [d.id, new Set(d.behavioral_manifestations ?? [])]),
  );
  const ctx = {
    errors,
    warnings,
    manifestMap,
    scoredComponents,
    registry,
    requestedComponentIds: requestedComponentIds ? new Set(requestedComponentIds) : null,
  };

  for (const def of RESILIENCE_COMPONENTS) {
    const comp = (narratives.components ?? []).find((c) => c.component_id === def.id);
    validateResilienceComponent(comp, def, ctx);
  }

  const synthesis = narratives.cross_component_synthesis ?? '';
  const urlMatches = synthesis.match(/https?:\/\/[^\s)]+/g) ?? [];
  const maxUrls = narrativeSynthesisMaxUrls();
  if (urlMatches.length > maxUrls) {
    errors.push(`cross_component_synthesis: exceeds ${maxUrls} distinct URLs`);
  }
  if (synthesis && !synthesis.includes('-') && !synthesis.includes('No shared evidence')) {
    warnings.push('cross_component_synthesis: expected bullet format or explicit non-claims');
  }
  warnSignalLabelsInProse(synthesis, 'cross_component_synthesis', warnings);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Format validation errors for LLM retry feedback.
 * @param {{ errors: string[], warnings: string[] }} result
 */
export function formatValidationFeedback(result) {
  const parts = [];
  if (result.errors?.length) {
    parts.push(`Validation errors:\n- ${result.errors.join('\n- ')}`);
  }
  if (result.warnings?.length) {
    parts.push(`Warnings:\n- ${result.warnings.join('\n- ')}`);
  }
  parts.push(
    'Reminders: signal_ref must match input exactly (type@url:… or [S#]); '
    + 'manifestations_evidenced must copy exact catalog strings; '
    + 'multi-ref claims must not use because/despite/due to/in response to.',
  );
  return parts.join('\n\n');
}
