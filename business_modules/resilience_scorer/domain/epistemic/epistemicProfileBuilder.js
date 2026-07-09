/**
 * Compute epistemic hints per component (mass, polarization, caps) without headline scores.
 */
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import {
  applySourceCap,
  sourceCapWasApplied,
  DEFAULT_SOURCE_TYPE_CAP,
  DEFAULT_ARTICLE_SOURCE_CAP,
} from './evidenceCaps.js';
import { buildDuplicateOccurrenceIndex, round3 } from './massContribution.js';
import { certaintyTuningFor } from './certaintyTuning.js';
import { collectComponentItems } from './componentItems.js';
import { defaultSignalWeights, resolveSignalWeights } from '../services/signals/signalWeights.js';
import { computeMediaMentionMass } from '../services/signals/mediaMentionMass.js';

function sumPolarityMass(items) {
  let positive = 0;
  let negative = 0;
  for (const it of items) {
    if (it.polarity === '+') positive += it.contribution;
    else negative += it.contribution;
  }
  return { positive, negative, evidenceMass: positive + negative, netEvidence: positive - negative };
}

function dominanceWarnings(items) {
  const warnings = [];
  for (const [label, keyFn, cap] of [
    ['source_type', (s) => s.source_type ?? '_unknown', DEFAULT_SOURCE_TYPE_CAP],
    ['article_source', (s) => s.article_source ?? '_unknown', DEFAULT_ARTICLE_SOURCE_CAP],
  ]) {
    const byKey = {};
    let total = 0;
    for (const it of items) {
      const k = keyFn(it.signal);
      byKey[k] = (byKey[k] ?? 0) + it.contribution;
      total += it.contribution;
    }
    if (total <= 0) continue;
    for (const [k, mass] of Object.entries(byKey)) {
      const share = mass / total;
      if (share > cap && Object.keys(byKey).length > 1) {
        warnings.push({
          layer: label,
          key: k,
          share: round3(share),
          cap,
          message: `${label} "${k}" exceeds ${Math.round(cap * 100)}% mass cap (${round3(share * 100)}%)`,
        });
      }
    }
  }
  return warnings;
}

function buildRetrievalPolicies(byComponent) {
  const diversify = [];
  const boost = [];
  const require_corroboration = [];

  for (const [componentId, comp] of Object.entries(byComponent)) {
    for (const w of comp.dominance_warnings ?? []) {
      if (w.layer === 'source_type') {
        diversify.push({ source_type: w.key, max_share: w.cap });
      }
    }
    if (comp.delta_significance === 'HIGH_POSITIVE_SWING' || comp.delta_significance === 'HIGH_NEGATIVE_SWING') {
      boost.push({ component_id: componentId, reason: 'significant_delta' });
    }
    if (comp.thin_evidence) {
      require_corroboration.push({ component_id: componentId, claim_type: 'any' });
    }
    if (comp.contested) {
      require_corroboration.push({ component_id: componentId, claim_type: 'contested_balance' });
    }
  }

  return { diversify, boost, require_corroboration };
}

function emptyComponentProfile(id, ctx) {
  return {
    evidence_mass: 0,
    thin_evidence: true,
    contested: false,
    certainty_band: 'low',
    polarization_band: null,
    dominance_warnings: [],
    delta_significance: null,
    media_mention_mass: round3(ctx.mediaMentionMass?.[id] ?? 0),
    signal_count: 0,
    distinct_article_count: 0,
  };
}

function certaintyBandFor(certainty) {
  if (certainty >= 0.65) return 'high';
  if (certainty >= 0.35) return 'medium';
  return 'low';
}

function polarizationBandFor(polarization, evidenceMass) {
  if (polarization > 0.5 && evidenceMass > 4) return 'contested';
  if (polarization > 0.5) return 'mixed';
  return 'one_sided';
}

function buildComponentProfile(id, items, articleSet, sourceSet, ctx) {
  const cappedItems = applySourceCap(items, { totalEvidenceMass: ctx.totalEvidenceMass ?? undefined });
  const mass = sumPolarityMass(cappedItems);
  const tuning = certaintyTuningFor(id);
  const certainty = mass.evidenceMass > 0
    ? 1 - Math.exp(-mass.evidenceMass / tuning.certM)
    : 0;
  const polarization = mass.evidenceMass > 0
    ? 1 - Math.abs(mass.netEvidence) / mass.evidenceMass
    : 0;

  return {
    evidence_mass: round3(mass.evidenceMass),
    positive_mass: round3(mass.positive),
    negative_mass: round3(mass.negative),
    net_mass: round3(mass.netEvidence),
    certainty: round3(certainty),
    certainty_band: certaintyBandFor(certainty),
    polarization: round3(polarization),
    polarization_band: polarizationBandFor(polarization, mass.evidenceMass),
    thin_evidence: mass.evidenceMass < 1.5,
    contested: polarization > 0.5 && mass.evidenceMass > 4,
    source_cap_applied: sourceCapWasApplied(items, cappedItems),
    source_cap_adaptive: cappedItems.some((it) => it._adaptive_cap === true) || undefined,
    dominance_warnings: dominanceWarnings(cappedItems),
    signal_count: items.length,
    distinct_article_count: articleSet.size,
    source_diversity: sourceSet.size,
    media_mention_mass: round3(ctx.mediaMentionMass?.[id] ?? 0),
    delta_significance: ctx.historicalMass?.[id]
      ? inferDeltaSignificance(mass.evidenceMass, ctx.historicalMass[id])
      : null,
  };
}

/**
 * @param {object[]} signals
 * @param {{ totalArticles?: number, historicalMass?: Record<string, number[]>, reportDate?: string }} [ctx]
 */
export function computeEpistemicProfile(signals, ctx = {}) {
  const signalWeights = resolveSignalWeights(defaultSignalWeights(), ctx.weightOverlay ?? null);
  const duplicateIndex = buildDuplicateOccurrenceIndex(signals ?? []);
  const mediaMentionMass = ctx.mediaMentionMass ?? computeMediaMentionMass(
    ctx.mediaSignals ?? signals ?? [],
    signalWeights,
  );
  const profileCtx = { ...ctx, mediaMentionMass };
  const byComponent = {};

  // Pre-compute total evidence mass across all components to enable adaptive caps for sparse data.
  const allComponentItems = COMPONENT_IDS.map((id) =>
    collectComponentItems(id, signals ?? [], duplicateIndex, signalWeights),
  );
  const totalEvidenceMass = allComponentItems.reduce(
    (sum, { items }) => sum + items.reduce((s, it) => s + (it.contribution ?? 0), 0),
    0,
  );

  for (let i = 0; i < COMPONENT_IDS.length; i++) {
    const id = COMPONENT_IDS[i];
    const { items, articleSet, sourceSet } = allComponentItems[i];
    byComponent[id] = items.length === 0
      ? emptyComponentProfile(id, profileCtx)
      : buildComponentProfile(id, items, articleSet, sourceSet, { ...profileCtx, totalEvidenceMass });
  }

  const retrieval_policies = buildRetrievalPolicies(byComponent);

  return {
    schema_version: '1.0',
    report_date: ctx.reportDate ?? null,
    by_component: byComponent,
    retrieval_policies,
    assessment_epistemic: ctx.assessmentEpistemic ?? {},
  };
}

function inferDeltaSignificance(currentMass, history) {
  if (!history?.length) return null;
  const mean = history.reduce((s, v) => s + v, 0) / history.length;
  const variance = history.reduce((s, v) => s + (v - mean) ** 2, 0) / history.length;
  const sd = Math.sqrt(variance) || 1;
  const z = (currentMass - mean) / sd;
  if (z >= 2) return 'HIGH_POSITIVE_SWING';
  if (z <= -2) return 'HIGH_NEGATIVE_SWING';
  if (Math.abs(z) >= 1.5) return 'MODERATE_SWING';
  return 'STABLE';
}
