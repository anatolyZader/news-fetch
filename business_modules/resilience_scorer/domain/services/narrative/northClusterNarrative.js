/**
 * North subregion cluster partitions and deterministic summaries for regional reports.
 *
 * Pipeline position: optional regional report enrichment — groups scoped signals
 * by PBO subregion for cluster-level narrative context.
 *
 * Owns: resolveNorthClusterId, partition/summary builders, UNCLUSTERED bucket.
 * Does NOT: compute void index cluster voids (see dataVoid/clusterVoid.js).
 *
 * Key collaborators: `business_modules/geo` north subregion ids, regional report scope.
 */

import { isNorthSubregionId } from '../../../../../business_modules/geo/index.js';

const UNCLUSTERED = 'unclustered';
const TOP_EVIDENCE_PER_CLUSTER = 3;

/**
 * @param {object | null | undefined} g
 * @returns {string | null}
 */
function readPboSubregionId(g) {
  return g?.classification?.pboSubregionId ?? g?.pboSubregionId ?? g?.subregionId ?? null;
}

// ── Cluster resolution ──────────────────────────────────────────────────────────

/**
 * Resolve north PBO subregion cluster id for a signal (or unclustered).
 *
 * @param {object} signal
 * @returns {string}
 */
export function resolveNorthClusterId(signal) {
  const g = signal?.geo;
  if (g?.kind === 'resolved') {
    const pboId = String(readPboSubregionId(g) ?? '').trim().toLowerCase();
    if (isNorthSubregionId(pboId)) return pboId;
  }
  const raw = signal?.pboSubregionId ?? signal?.subregionId;
  if (raw != null) {
    const id = String(raw).trim().toLowerCase();
    if (isNorthSubregionId(id)) return id;
  }
  return UNCLUSTERED;
}

/**
 * @param {object[]} signals
 * @returns {Record<string, object[]>}
 */
export function buildNorthClusterPartitions(signals) {
  /** @type {Record<string, object[]>} */
  const partitions = {};
  for (const s of signals ?? []) {
    if (!s || typeof s !== 'object') continue;
    const clusterId = resolveNorthClusterId(s);
    if (!partitions[clusterId]) partitions[clusterId] = [];
    partitions[clusterId].push(s);
  }
  return partitions;
}

/**
 * @param {object[]} clusterSignals
 * @returns {Record<string, number>}
 */
function signalTypeCounts(clusterSignals) {
  /** @type {Record<string, number>} */
  const counts = {};
  for (const s of clusterSignals) {
    const t = s?.signal_type ?? s?.type ?? 'unknown';
    counts[t] = (counts[t] ?? 0) + 1;
  }
  return counts;
}

/**
 * @param {Record<string, object[]>} partitions
 * @returns {Record<string, object>}
 */
export function buildNorthClusterSummaries(partitions) {
  /** @type {Record<string, object>} */
  const out = {};
  for (const [clusterId, list] of Object.entries(partitions ?? {})) {
    const sourceTypes = [...new Set(list.map((s) => s?.source_type).filter(Boolean))];
    const topEvidence = list
      .map((s) => String(s?.evidence ?? '').trim())
      .filter(Boolean)
      .slice(0, TOP_EVIDENCE_PER_CLUSTER);
    out[clusterId] = {
      cluster_id: clusterId,
      signal_count: list.length,
      signal_type_counts: signalTypeCounts(list),
      source_types: sourceTypes,
      top_evidence: topEvidence,
    };
  }
  return out;
}

/**
 * @param {object[]} signals
 * @returns {Record<string, object>}
 */
export function buildNorthClusterNarrativesFromSignals(signals) {
  const partitions = buildNorthClusterPartitions(signals);
  return buildNorthClusterSummaries(partitions);
}

/** Cluster id for signals without a resolved north subregion. */
export { UNCLUSTERED as NORTH_CLUSTER_UNCLUSTERED };
