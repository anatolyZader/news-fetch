/**
 * Format component evidence bundle from rich operator surface for chat tools/context.
 */

const ROLE_ORDER = ['scored', 'investigation_only', 'context_only', 'quarantined'];

/**
 * @param {object|null|undefined} comp
 * @returns {{ by_role: Record<string, number>, by_source: Record<string, number>, total: number }}
 */
export function summarizeInvestigationPool(comp) {
  const pool = comp?.operator_investigation_pool ?? [];
  const byRole = {};
  const bySource = {};
  for (const item of pool) {
    const role = item.operator_epistemic_role ?? 'investigation_only';
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
  const bySource = comp?.operator_investigation_pool_by_source ?? [];
  for (const { key, items } of bySource) {
    lines.push(`Source ${key} (${items.length}):`);
    for (const item of items.slice(0, linesPerSource)) {
      lines.push(`  - [${item.operator_epistemic_role ?? 'n/a'}] ${String(item.evidence ?? '').slice(0, 400)}`);
    }
    if (items.length > linesPerSource) {
      lines.push(`  ... +${items.length - linesPerSource} more`);
    }
  }
  return lines.join('\n');
}

/**
 * @param {object|null|undefined} comp
 * @param {{ role?: string|null, limit?: number }} [opts]
 * @returns {object[]}
 */
export function selectPoolItems(comp, opts = {}) {
  let pool = comp?.operator_investigation_pool ?? [];
  const role = opts.role;
  if (role) {
    pool = pool.filter((item) => item.operator_epistemic_role === role);
  }
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
  const claims = (comp.narrative_claims ?? []).map((c) => ({
    text: String(c.text ?? '').slice(0, 600),
    signal_refs: c.signal_refs ?? c.evidence_refs ?? [],
    operator_epistemic_role: c.operator_epistemic_role ?? null,
  }));

  const payload = {
    component_id: componentId,
    narrative_operator: String(comp.narrative_operator ?? comp.narrative ?? '').slice(0, 4000),
    pool_summary: summarizeInvestigationPool(comp),
    claims,
    pool_items: items.map((item) => ({
      ref: item.ref,
      operator_epistemic_role: item.operator_epistemic_role,
      signal_provenance: item.signal_provenance,
      source_type: item.source_type,
      article_source: item.article_source,
      url: item.url,
      evidence: String(item.evidence ?? '').slice(0, 1200),
    })),
  };

  return JSON.stringify(payload, null, 2);
}
