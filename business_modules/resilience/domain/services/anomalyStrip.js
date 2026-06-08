/**
 * Anomaly strip — OOV/residual/salience signals bypassing synthesizer prose.
 */

/**
 * @param {object|null|undefined} assessment
 * @returns {boolean}
 */
function isCrisisEpistemicMode(assessment) {
  const mode = assessment?.assessment_mode ?? 'normal';
  const sampling = assessment?.epistemic_status?.sampling_status ?? 'normal';
  const voidLevel = assessment?.data_void?.level ?? 'none';
  if (mode === 'abstained' || sampling === 'blind') return true;
  if (assessment?.data_void?.digital_darkness === true) return true;
  return voidLevel === 'critical' || voidLevel === 'elevated';
}

function claimHasAnomalyFlag(claim) {
  const flags = claim.flags ?? claim.epistemic_flags ?? [];
  return flags.includes('oov_cluster') || flags.includes('unverified');
}

/**
 * @param {object|null|undefined} oovBurst
 * @returns {object[]}
 */
function collectOovBurstClusters(oovBurst) {
  const clusters = [];
  for (const c of oovBurst?.top_clusters ?? []) {
    clusters.push({
      cluster_key: c.cluster_key ?? c.key ?? 'unknown',
      count: c.count ?? 0,
      keywords: c.keywords ?? [],
      sample_evidence: c.sample_evidence ?? [],
      high_salience: c.high_salience === true,
      source: 'oov_burst',
    });
  }

  if (!clusters.length && oovBurst?.top_cluster_key) {
    clusters.push({
      cluster_key: oovBurst.top_cluster_key,
      count: oovBurst.top_cluster_count ?? 0,
      keywords: oovBurst.top_cluster_keywords ?? [],
      sample_evidence: [],
      high_salience: oovBurst.salience_bypass === true,
      source: 'oov_burst',
    });
  }
  return clusters;
}

/**
 * @param {object} assessment
 * @param {object[]} clusters
 */
function appendEvidenceTreeClusters(assessment, clusters) {
  for (const comp of assessment.components ?? []) {
    for (const node of comp.evidence_tree ?? comp.claims ?? []) {
      if (!claimHasAnomalyFlag(node)) continue;
      const key = node.claim_id ?? `${comp.component_id}:${String(node.text ?? '').slice(0, 30)}`;
      if (clusters.some((c) => c.cluster_key === key)) continue;
      clusters.push({
        cluster_key: key,
        count: 1,
        keywords: node.flags ?? [],
        sample_evidence: [String(node.text ?? '').slice(0, 200)],
        high_salience: comp.instrument?.salience_critical === true,
        source: 'evidence_tree',
        component_id: comp.component_id,
      });
    }
  }
}

/**
 * @param {object|null|undefined} assessment
 * @returns {object[]}
 */
function collectSalienceSignals(assessment) {
  return (assessment.components ?? [])
    .filter((c) => c.instrument?.salience_critical === true || c.salience_critical === true)
    .map((c) => ({
      component_id: c.component_id,
      operator_status: c.operator_status ?? c.instrument?.confidence,
      instrument: c.instrument?.thin_evidence_instrument ?? null,
    }));
}

/**
 * @param {object|null|undefined} oovBurst
 * @param {object[]} salience_signals
 * @param {boolean} crisisMode
 * @param {object[]} clusters
 * @returns {string}
 */
function deriveAnomalyLevel(oovBurst, salience_signals, crisisMode, clusters) {
  let level = oovBurst?.level ?? 'info';
  if (salience_signals.length && level === 'info') level = 'warning';
  if (crisisMode && clusters.length && level === 'info') level = 'warning';
  return level;
}

function shouldShowOperator(oovBurst, crisisMode, clusters, salience_signals) {
  if (oovBurst?.alert === true) return true;
  if (crisisMode && clusters.length >= 1) return true;
  return salience_signals.length >= 1;
}

/**
 * @param {object|null} oovBurst
 * @param {boolean} crisisMode
 * @param {object[]} clusters
 * @param {object[]} salience_signals
 */
function buildAnomalyStripResult(oovBurst, crisisMode, clusters, salience_signals) {
  const totalClusterCount = clusters.reduce((n, c) => n + (c.count ?? 0), 0);
  return {
    level: deriveAnomalyLevel(oovBurst, salience_signals, crisisMode, clusters),
    clusters: clusters.slice(0, 8),
    salience_signals: salience_signals.slice(0, 6),
    show_operator: shouldShowOperator(oovBurst, crisisMode, clusters, salience_signals),
    total_count: totalClusterCount,
    crisis_mode: crisisMode,
  };
}

/**
 * @param {object|null|undefined} assessment
 * @returns {{ level: string, clusters: object[], salience_signals: object[], show_operator: boolean }|null}
 */
export function buildAnomalyStrip(assessment) {
  if (!assessment || typeof assessment !== 'object') return null;

  const oovBurst = assessment.oov_burst ?? null;
  const crisisMode = isCrisisEpistemicMode(assessment);
  const clusters = collectOovBurstClusters(oovBurst);
  appendEvidenceTreeClusters(assessment, clusters);
  const salience_signals = collectSalienceSignals(assessment);

  if (!clusters.length && !salience_signals.length) return null;

  return buildAnomalyStripResult(oovBurst, crisisMode, clusters, salience_signals);
}

export { isCrisisEpistemicMode };
