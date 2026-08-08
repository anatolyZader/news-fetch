/**
 * Format component evidence bundle from rich user surface for chat tools/context.
 */

const ROLE_ORDER = ['scored', 'investigation_only', 'context_only', 'quarantined'];

/**
 * @param {object|null|undefined} comp
 * @returns {{ by_role: Record<string, number>, by_source: Record<string, number>, total: number }}
 */
export function summarizeInvestigationPool(comp) {
  const { pool } = resolveEvidencePool(comp);
  const byRole = {};
  const bySource = {};
  for (const item of pool) {
    const role = item.user_epistemic_role ?? 'investigation_only';
    byRole[role] = (byRole[role] ?? 0) + 1;
    const src = item.source_type ?? 'other';
    bySource[src] = (bySource[src] ?? 0) + 1;
  }
  return { by_role: byRole, by_source: bySource, total: pool.length };
}

/**
 * @param {object|null|undefined} comp
 * @param {{ linesPerSource?: number }} [opts]
 * @returns {string}
 */
export function formatPoolSummaryForChat(comp, opts = {}) {
  const linesPerSource = opts.linesPerSource ?? 3;
  const summary = summarizeInvestigationPool(comp);
  if (summary.total === 0) return 'Investigation pool: empty.';

  const lines = [`Investigation pool: ${summary.total} items`];
  for (const role of ROLE_ORDER) {
    if (summary.by_role[role] > 0) {
      lines.push(`  ${role}: ${summary.by_role[role]}`);
    }
  }
  const bySource = comp?.user_investigation_pool_by_source ?? [];
  for (const { key, items } of bySource) {
    lines.push(`Source ${key} (${items.length}):`);
    for (const item of items.slice(0, linesPerSource)) {
      lines.push(`  - [${item.user_epistemic_role ?? 'n/a'}] ${String(item.evidence ?? '').slice(0, 400)}`);
    }
    if (items.length > linesPerSource) {
      lines.push(`  ... +${items.length - linesPerSource} more`);
    }
  }
  return lines.join('\n');
}

/**
 * Resolve the deepest evidence layer available for a component: the rich
 * investigation pool when present, else the structured user evidence
 * (non-rich reports) mapped to the same item shape.
 * @param {object|null|undefined} comp
 * @returns {{ pool: object[], layer: 'investigation_pool'|'evidence_structured'|'none' }}
 */
export function resolveEvidencePool(comp) {
  const pool = comp?.user_investigation_pool ?? [];
  if (pool.length > 0) return { pool, layer: 'investigation_pool' };
  const structured = comp?.evidence_user_structured ?? [];
  if (structured.length === 0) return { pool: [], layer: 'none' };
  return {
    pool: structured.map((item) => ({
      ref: item.ref,
      user_epistemic_role: item.user_epistemic_role ?? 'scored',
      signal_provenance: item.signal_provenance,
      signal_type: item.signal_type,
      source_type: item.source_type,
      article_source: item.article_source,
      url: item.url,
      evidence: item.evidence ?? item.text,
    })),
    layer: 'evidence_structured',
  };
}

/**
 * @param {object|null|undefined} comp
 * @param {{ role?: string|null, limit?: number }} [opts]
 * @returns {object[]}
 */
function roleRank(item) {
  const idx = ROLE_ORDER.indexOf(item.user_epistemic_role ?? 'investigation_only');
  return idx === -1 ? ROLE_ORDER.length : idx;
}

export function selectPoolItems(comp, opts = {}) {
  let { pool } = resolveEvidencePool(comp);
  const role = opts.role;
  if (role) {
    pool = pool.filter((item) => item.user_epistemic_role === role);
  }
  // Scored items are the report's evidentiary basis — they lead the payload so
  // a limit or partial read never drops them in favor of unscored extras.
  pool = [...pool].sort((a, b) => roleRank(a) - roleRank(b));
  const limit = opts.limit ?? 50;
  return pool.slice(0, Math.min(limit, 100));
}

/**
 * @param {object|null|undefined} reportData
 * @param {string} componentId
 * @param {{ role?: string|null, limit?: number }} [opts]
 * @returns {string}
 */
export function formatComponentEvidenceBundle(reportData, componentId, opts = {}) {
  const comp = (reportData?.assessment?.components ?? [])
    .find((c) => c.component_id === componentId);
  if (!comp) return `Component ${componentId} not found in report.`;

  const items = selectPoolItems(comp, opts);
  const { layer } = resolveEvidencePool(comp);
  const claims = (comp.narrative_claims ?? []).map((c) => ({
    text: String(c.text ?? '').slice(0, 600),
    signal_refs: c.signal_refs ?? c.evidence_refs ?? [],
    user_epistemic_role: c.user_epistemic_role ?? null,
  }));

  // Narrative stays an excerpt: the full text lives in the report context /
  // get_report_context — this bundle is the evidence layer beneath it.
  const payload = {
    component_id: componentId,
    narrative_excerpt: String(comp.narrative_user ?? comp.narrative ?? '').slice(0, 300),
    evidence_layer: layer,
    pool_summary: summarizeInvestigationPool(comp),
    claims,
    pool_items: items.map((item) => ({
      ref: item.ref,
      user_epistemic_role: item.user_epistemic_role,
      signal_provenance: item.signal_provenance,
      signal_type: item.signal_type,
      source_type: item.source_type,
      article_source: item.article_source,
      url: item.url,
      evidence: String(item.evidence ?? '').slice(0, 350),
    })),
  };

  return JSON.stringify(payload, null, 2);
}
