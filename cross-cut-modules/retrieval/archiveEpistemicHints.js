/**
 * Archive-derived epistemic hints independent of catalog signal mass.
 */
import { COMPONENT_IDS } from '../resilience-contracts/componentIds.js';

/**
 * Per-component archive mention mass from RAG / hybrid hits (chunk count weighted by score).
 * @param {object[]} hits
 */
export function computeArchiveMentionMass(hits = []) {
  const byComponent = Object.fromEntries(COMPONENT_IDS.map((id) => [id, 0]));

  for (const h of hits) {
    const compId = h.component_id;
    const score = h.rrfScore ?? h.relevanceScore ?? h.score ?? 0.5;
    const mass = Math.min(1, Math.max(0.1, Number(score) || 0.5));
    if (compId && byComponent[compId] != null) {
      byComponent[compId] += mass;
    } else {
      byComponent.narrative += mass * 0.25;
    }
  }

  for (const id of COMPONENT_IDS) {
    byComponent[id] = Math.round(byComponent[id] * 1000) / 1000;
  }
  return byComponent;
}

/**
 * Components with archive activity but thin catalog signal mass.
 * @param {object} epistemicProfile
 * @param {Record<string, number>} archiveMentionMass
 * @param {{ archiveThreshold?: number, evidenceThreshold?: number }} [opts]
 */
export function detectArchiveAnomalies(epistemicProfile, archiveMentionMass, opts = {}) {
  const archiveThreshold = opts.archiveThreshold ?? 2.0;
  const evidenceThreshold = opts.evidenceThreshold ?? 1.5;
  const anomalies = [];

  for (const compId of COMPONENT_IDS) {
    const ep = epistemicProfile?.by_component?.[compId] ?? {};
    const archiveMass = archiveMentionMass[compId] ?? 0;
    const evidenceMass = ep.evidence_mass ?? 0;
    if (archiveMass >= archiveThreshold && evidenceMass < evidenceThreshold) {
      anomalies.push({
        component_id: compId,
        archive_mention_mass: archiveMass,
        evidence_mass: evidenceMass,
        reason: 'archive mention spike without catalog signal mass',
      });
    }
  }
  return anomalies;
}
