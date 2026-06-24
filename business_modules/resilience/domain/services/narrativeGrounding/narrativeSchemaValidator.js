/**
 * Post-parse validation of narrative LLM JSON output.
 */

import { RESILIENCE_COMPONENTS } from '../../resilienceComponents.js';
import {
  EVIDENCE_OVERLAP_MIN,
  narrativeSynthesisMaxUrls,
} from './groundingConfig.js';
import { validateClaimRelation } from './coOccurrenceGraph.js';
import { resolveRef } from './signalRefRegistry.js';
import {
  bestEvidenceOverlap,
  findForbiddenConnectives,
  splitSentences,
  stripMarkdownLinks,
} from './narrativeTextUtils.js';

const VALID_RELATIONS = new Set(['parallel', 'same_article_only', 'none']);

/**
 * @param {object} comp
 * @param {object} def
 * @param {object} ctx
 */
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
    for (const ref of refs) {
      if (!resolveRef(ref, registry)) {
        errors.push(`${def.id}: unknown signal_ref "${ref}"`);
      }
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

  for (const sentence of splitSentences(narrative)) {
    const refsInClaims = (comp.narrative_claims ?? []).flatMap((c) => c.signal_refs ?? []);
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

/**
 * @param {object | undefined} comp
 * @param {object} def
 * @param {object} ctx
 */
function validateResilienceComponent(comp, def, ctx) {
  const { errors, warnings, manifestMap, scoredComponents } = ctx;
  if (!comp) {
    errors.push(`${def.id}: missing component block`);
    return;
  }

  const scored = scoredComponents[def.id] ?? {};
  const signalCount = scored.signal_count ?? scored.signals?.length ?? 0;

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

  for (const evItem of comp.evidence ?? []) {
    const stripped = stripMarkdownLinks(evItem);
    const overlaps = (scored.signals ?? []).map((s) =>
      bestEvidenceOverlap(stripped, s.evidence ?? ''));
    const maxOverlap = overlaps.length ? Math.max(...overlaps) : 0;
    if (signalCount > 0 && maxOverlap < EVIDENCE_OVERLAP_MIN * 0.5) {
      warnings.push(`${def.id}: evidence item low overlap (${maxOverlap.toFixed(2)})`);
    }
  }

  validateNarrativeConnectives(comp, def, ctx);
}

/**
 * @param {object} narratives
 * @param {object} opts
 * @param {Record<string, object>} opts.scoredComponents
 * @param {{ byRef: Map<string, object> }} opts.registry
 */
export function validateNarrativeOutput(narratives, opts = {}) {
  const errors = [];
  const warnings = [];
  const { scoredComponents = {}, registry } = opts;
  const manifestMap = Object.fromEntries(
    RESILIENCE_COMPONENTS.map((d) => [d.id, new Set(d.behavioral_manifestations ?? [])]),
  );
  const ctx = { errors, warnings, manifestMap, scoredComponents, registry };

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
