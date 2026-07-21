/**
 * Co-occurrence constraints: which signals may share a sentence in narrative claims.
 *
 * Pipeline position: narrative LLM prompt rules and post-parse claim validation;
 * part of post-hoc narrative grounding (not GROUNDING_TIER).
 *
 * Owns: same-URL/source/field-family grouping, validateClaimRelation, prompt block formatter.
 * Does NOT: score component evidence or partition quarantined signals.
 *
 * Key collaborators: `signalRefRegistry.js`, `narrativeSchemaValidator.js`,
 * narrative facts-pass LLM prompts.
 */

import { signalArticleKey } from './signalRefRegistry.js';

const FIELD_FAMILY = new Set(['field', 'visits', 'pbo', 'pbo_regional', 'naftali', 'whatsapp']);

// ── Group construction ────────────────────────────────────────────────────────

/**
 * Build url/source/field co-occurrence groups from signal ref registry.
 *
 * @param {{ byRef: Map<string, object> }} registry
 * @returns {{ urlGroups: Map<string, string[]>, sourceGroups: Map<string, string[]>, fieldGroups: Map<string, string[]> }}
 */
export function buildCoOccurrenceGroups(registry) {
  const urlGroups = new Map();
  const sourceGroups = new Map();
  const fieldGroups = new Map();

  for (const [ref, entry] of registry.byRef.entries()) {
    const signal = entry.signal;
    const urlKey = signal?.article_url ?? null;
    if (urlKey) {
      const g = urlGroups.get(urlKey) ?? [];
      g.push(ref);
      urlGroups.set(urlKey, g);
    }
    const src = signal?.article_source ?? null;
    if (src) {
      const g = sourceGroups.get(src) ?? [];
      g.push(ref);
      sourceGroups.set(src, g);
    }
    const st = signal?.source_type ?? null;
    if (st && FIELD_FAMILY.has(st)) {
      const g = fieldGroups.get(st) ?? [];
      g.push(ref);
      fieldGroups.set(st, g);
    }
  }

  return { urlGroups, sourceGroups, fieldGroups };
}

// ── Prompt formatting ─────────────────────────────────────────────────────────

/**
 * Format co-occurrence rules block for narrative LLM system prompt.
 *
 * @param {{ byRef: Map<string, object> }} registry
 * @returns {string}
 */
export function formatCoOccurrenceForPrompt(registry) {
  const { urlGroups, fieldGroups } = buildCoOccurrenceGroups(registry);
  const lines = [
    '━━━ CO-OCCURRENCE (same sentence allowed only within a group) ━━━',
    'Signals may appear in one sentence ONLY if they share the same article_url, same article_source, or same field-family source_type.',
  ];

  const urlEntries = [...urlGroups.entries()].filter(([, refs]) => refs.length > 1).slice(0, 12);
  if (urlEntries.length) {
    lines.push('Same-URL groups (excerpt):');
    for (const [url, refs] of urlEntries) {
      lines.push(`  ${refs.join(', ')} → ${url.slice(0, 80)}`);
    }
  }

  const fieldEntries = [...fieldGroups.entries()].filter(([, refs]) => refs.length > 1);
  if (fieldEntries.length) {
    lines.push('Field-family groups:');
    for (const [st, refs] of fieldEntries) {
      lines.push(`  ${st}: ${refs.join(', ')}`);
    }
  }

  if (urlEntries.length === 0 && fieldEntries.length === 0) {
    lines.push('No multi-signal same-source groups today — treat each signal as independent unless explicitly same URL.');
  }

  lines.push('');
  return lines.join('\n');
}

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate multi-ref claim relation against co-occurrence rules.
 *
 * @param {string[]} refs
 * @param {string} relation
 * @param {{ byRef: Map<string, object> }} registry
 * @returns {{ ok: boolean, reason?: string, relation?: string }}
 */
export function validateClaimRelation(refs, relation, registry) {
  if (!Array.isArray(refs) || refs.length === 0) {
    return { ok: false, reason: 'no_refs' };
  }
  if (refs.length === 1) return { ok: true, relation: relation ?? 'none' };

  const entries = refs.map((r) => resolveEntry(r, registry)).filter(Boolean);
  if (entries.length !== refs.length) {
    return { ok: false, reason: 'unknown_ref' };
  }

  const urls = new Set(entries.map((e) => e.signal?.article_url).filter(Boolean));
  const sameUrl = urls.size === 1 && urls.size > 0;

  if (relation === 'same_article_only') {
    if (!sameUrl) return { ok: false, reason: 'same_article_only_requires_shared_url' };
    return { ok: true };
  }

  if (relation === 'parallel' || relation === 'none' || relation == null) {
    return { ok: true };
  }

  if (sameUrl) return { ok: true };

  const canCoOccur = entries.every((e, _, arr) =>
    arr.every((o) => signalsMayCoOccur(e.signal, o.signal)));
  if (!canCoOccur) {
    return { ok: false, reason: 'refs_not_co_occurring' };
  }
  return { ok: true };
}

function resolveEntry(ref, registry) {
  return registry?.byRef?.get(ref) ?? null;
}

/**
 * Whether two signals may appear in the same narrative sentence.
 *
 * @param {object} a
 * @param {object} b
 * @returns {boolean}
 */
export function signalsMayCoOccur(a, b) {
  if (!a || !b) return false;
  if (a.article_url && b.article_url && a.article_url === b.article_url) return true;
  if (a.article_source && b.article_source && a.article_source === b.article_source) return true;
  const stA = a.source_type;
  const stB = b.source_type;
  if (stA && stB && stA === stB && FIELD_FAMILY.has(stA)) return true;
  return signalArticleKey(a) === signalArticleKey(b);
}
