/**
 * Routing rationale labels for rendered evidence bullets.
 *
 * Evidence attaches to a component purely via the signal_type → component
 * routing table (signalRouting.js); the label makes that rationale visible so
 * an item never looks arbitrary under its component. Shared by the rich
 * investigation pool and the claims-derived fallback (import from both
 * operatorInvestigationSurface.js and operatorNarrativeSurface.js would
 * otherwise create a cycle).
 */

/**
 * Backtick code-span suffix, e.g. " `institutional_abandonment_perception · primary -0.9`".
 * Placed after the [source] link as a directionally neutral ASCII run — safe
 * to append to RTL (Hebrew) evidence text.
 *
 * @param {{ signal_type?: string|null, routing_role?: string|null, routing_weight?: number|null }} item
 * @returns {string}
 */
export function routingLabelSuffix(item) {
  if (!item?.signal_type) return '';
  const role = item.routing_role ?? 'primary';
  const w = item.routing_weight;
  let weightPart = '';
  if (Number.isFinite(w)) {
    const sign = w > 0 ? '+' : '';
    weightPart = ` ${sign}${w}`;
  }
  return ` \`${item.signal_type} · ${role}${weightPart}\``;
}

/**
 * How inferred-edge items render in the evidence list, from the
 * RESILIENCE_POOL_INFERRED_RENDER env var: 'label' (default — keep, labeled,
 * sorted after primary) or 'hide' (drop from the rendered list; the item
 * still exists in the pool JSON).
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'label'|'hide'}
 */
export function inferredPoolRenderMode(env = process.env) {
  return env.RESILIENCE_POOL_INFERRED_RENDER === 'hide' ? 'hide' : 'label';
}

/**
 * Primary-edge items first, then by descending scoring contribution.
 *
 * @param {{ routing_role?: string, contribution?: number }} a
 * @param {{ routing_role?: string, contribution?: number }} b
 * @returns {number}
 */
export function comparePoolItems(a, b) {
  const aInferred = a?.routing_role === 'inferred';
  const bInferred = b?.routing_role === 'inferred';
  if (aInferred !== bInferred) return aInferred ? 1 : -1;
  return (b?.contribution ?? 0) - (a?.contribution ?? 0);
}
