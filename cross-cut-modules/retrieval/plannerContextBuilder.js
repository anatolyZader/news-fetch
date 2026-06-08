/**
 * Planner context — gaps, media anomalies, OOV summary, exploration candidates.
 */
import { COMPONENT_IDS } from '../resilience-contracts/componentIds.js';
import { classifyGap } from './evidenceGraph.js';
import { detectArchiveAnomalies } from './archiveEpistemicHints.js';

const MEDIA_MASS_THRESHOLD = 2.0;
const LOW_EVIDENCE_THRESHOLD = 1.5;
const MAX_EXPLORATION_CANDIDATES = 2;
const EXPLORATION_MODES = new Set(['normal', 'degraded']);

export function mediaExploreEnabled() {
  const v = process.env.RESILIENCE_ASSESS_MEDIA_EXPLORE;
  return v == null || v === '' || v === '1' || v === 'true';
}

export function gapPlannerEnabled() {
  const v = process.env.RESILIENCE_ASSESS_GAP_PLANNER;
  return v == null || v === '' || v === '1' || v === 'true';
}

/**
 * @param {object} params
 */
export function buildPlannerContext(params) {
  const {
    epistemicProfile,
    evidenceGraph,
    oovBurst = null,
    investigationOovBurst = null,
    assessmentMode = 'normal',
    abstentionComponents = [],
    archiveMentionMass = null,
    residualObservations = [],
  } = params;

  const abstentionSet = new Set(abstentionComponents);

  const retrieval_gaps_by_component = {};
  const classified_gaps = [];
  for (const compId of COMPONENT_IDS) {
    const gaps = evidenceGraph?.by_component?.[compId]?.retrieval_gaps ?? [];
    retrieval_gaps_by_component[compId] = gaps;
    for (const g of gaps) {
      const classified = classifyGap(g, compId);
      classified_gaps.push(classified);
    }
  }

  const media_volume_anomalies = [];
  for (const compId of COMPONENT_IDS) {
    const ep = epistemicProfile?.by_component?.[compId] ?? {};
    const mediaMass = ep.media_mention_mass ?? 0;
    const evidenceMass = ep.evidence_mass ?? 0;
    if (mediaMass >= MEDIA_MASS_THRESHOLD && evidenceMass < LOW_EVIDENCE_THRESHOLD) {
      media_volume_anomalies.push({
        component_id: compId,
        media_mention_mass: mediaMass,
        evidence_mass: evidenceMass,
        reason: 'high media volume with thin behavioral signals',
      });
    }
  }

  let oov_summary = null;
  const burst = investigationOovBurst ?? oovBurst;
  const residualCount = burst?.residual_observation_count
    ?? residualObservations.length
    ?? 0;
  if (burst?.alert === true
    || (burst?.top_cluster_count ?? 0) >= 3
    || (residualCount >= 2 && (burst?.top_cluster_count ?? 0) >= 1)) {
    oov_summary = {
      alert: burst?.alert ?? false,
      level: burst?.level ?? 'none',
      top_cluster_count: burst?.top_cluster_count ?? 0,
      top_cluster_keywords: (burst?.top_cluster_keywords ?? []).slice(0, 8),
      total: burst?.total ?? 0,
      residual_observation_count: residualCount,
      investigation_mode: burst?.investigation_mode === true,
    };
  }

  let residual_summary = null;
  if (residualObservations.length > 0) {
    residual_summary = {
      count: residualObservations.length,
      by_component: Object.fromEntries(
        COMPONENT_IDS.map((id) => [
          id,
          residualObservations.filter((o) => (o.component_id ?? mapResidualComponent(o)) === id).length,
        ]),
      ),
    };
  }

  const archive_anomalies = archiveMentionMass
    ? detectArchiveAnomalies(epistemicProfile, archiveMentionMass)
    : [];

  let exploration_candidates = [];
  if (mediaExploreEnabled() && EXPLORATION_MODES.has(assessmentMode)) {
    const exploreFromMedia = media_volume_anomalies
      .filter((a) => !abstentionSet.has(a.component_id));
    const exploreFromArchive = archive_anomalies
      .filter((a) => !abstentionSet.has(a.component_id));
    const combined = [...exploreFromMedia, ...exploreFromArchive];
    exploration_candidates = combined
      .slice(0, MAX_EXPLORATION_CANDIDATES)
      .map((a, i) => ({
        id: `explore_${i + 1}`,
        component_id: a.component_id,
        type: 'archive_explore',
        topic: a.reason?.includes('archive') ? 'archive mention spike' : 'zero signals high media volume',
        reason: a.reason,
      }));
  }

  const investigation_gaps = classified_gaps.filter(
    (g) => g.gap_type === 'investigation' && !abstentionSet.has(g.component_id),
  );

  return {
    retrieval_gaps_by_component,
    classified_gaps,
    investigation_gaps,
    media_volume_anomalies,
    archive_anomalies,
    oov_summary,
    residual_summary,
    exploration_candidates,
  };
}

function mapResidualComponent(obs) {
  const text = String(obs.behavioral_description ?? obs.evidence ?? '').toLowerCase();
  if (text.includes('shelter') || text.includes('emergency')) return 'lifesaving_behavior';
  if (text.includes('mayor') || text.includes('leadership')) return 'leadership';
  return 'narrative';
}

/**
 * Build gap_closure_tasks from investigation gaps.
 * @param {object[]} investigationGaps
 */
export function buildGapClosureTasks(investigationGaps) {
  if (!gapPlannerEnabled()) return [];
  return investigationGaps.map((g, i) => ({
    id: g.gap_id ?? `gap_${i + 1}`,
    gap_id: g.gap_id,
    component_id: g.component_id,
    gap_type: g.gap_type,
    action: g.gap_text,
    type: 'gap_closure',
  }));
}

export { MEDIA_MASS_THRESHOLD, MAX_EXPLORATION_CANDIDATES };
