/**
 * Compute epistemic hints per component (mass, polarization, caps) without headline scores.
 */
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import { applySourceCap } from '../../../resilience/domain/services/scoring/applyEvidenceCaps.js';
import {
  buildDuplicateOccurrenceIndex,
  round3,
  sourceCapWasApplied,
  tuningFor,
} from '../../../resilience/domain/services/scoring/scoringShared.js';
import {
  collectComponentItems,
} from '../../../resilience/domain/services/scoring/scoreSingleComponent.js';
import {
  defaultSignalWeights,
  resolveSignalWeights,
} from '../../../resilience/domain/services/scoring/scoringOverrides.js';

const SOURCE_TYPE_CAP = 0.5;
const OUTLET_CAP = 0.35;

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
    ['source_type', (s) => s.source_type ?? '_unknown', SOURCE_TYPE_CAP],
    ['article_source', (s) => s.article_source ?? '_unknown', OUTLET_CAP],
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

/**
 * @param {object[]} signals
 * @param {{ totalArticles?: number, historicalMass?: Record<string, number[]>, reportDate?: string }} [ctx]
 */
export function computeEpistemicProfile(signals, ctx = {}) {
  const totalArticles = ctx.totalArticles ?? 0;
  const signalWeights = resolveSignalWeights(defaultSignalWeights(), ctx.weightOverlay ?? null);
  const duplicateIndex = buildDuplicateOccurrenceIndex(signals ?? []);
  const byComponent = {};

  for (const id of COMPONENT_IDS) {
    const { items, articleSet, sourceSet } = collectComponentItems(
      id,
      signals ?? [],
      duplicateIndex,
      signalWeights,
    );
    if (items.length === 0) {
      byComponent[id] = {
        evidence_mass: 0,
        thin_evidence: true,
        contested: false,
        certainty_band: 'low',
        polarization_band: null,
        dominance_warnings: [],
        delta_significance: null,
        media_mention_mass: round3(ctx.scoredComponents?.[id]?.media_mention_mass ?? 0),
      };
      continue;
    }

    const cappedItems = applySourceCap(items);
    const mass = sumPolarityMass(cappedItems);
    const tuning = tuningFor(id);
    const certainty = mass.evidenceMass > 0
      ? 1 - Math.exp(-mass.evidenceMass / tuning.certM)
      : 0;
    const polarization = mass.evidenceMass > 0
      ? 1 - Math.abs(mass.netEvidence) / mass.evidenceMass
      : 0;

    const thin = mass.evidenceMass < 1.5;
    const contested = polarization > 0.5 && mass.evidenceMass > 4;
    const warnings = dominanceWarnings(cappedItems);

    let certaintyBand = 'low';
    if (certainty >= 0.65) certaintyBand = 'high';
    else if (certainty >= 0.35) certaintyBand = 'medium';

    let polarizationBand = 'one_sided';
    if (polarization > 0.5 && mass.evidenceMass > 4) polarizationBand = 'contested';
    else if (polarization > 0.5) polarizationBand = 'mixed';

    byComponent[id] = {
      evidence_mass: round3(mass.evidenceMass),
      positive_mass: round3(mass.positive),
      negative_mass: round3(mass.negative),
      net_mass: round3(mass.netEvidence),
      certainty: round3(certainty),
      certainty_band: certaintyBand,
      polarization: round3(polarization),
      polarization_band: polarizationBand,
      thin_evidence: thin,
      contested,
      source_cap_applied: sourceCapWasApplied(items, cappedItems),
      dominance_warnings: warnings,
      distinct_article_count: articleSet.size,
      source_diversity: sourceSet.size,
      media_mention_mass: round3(ctx.scoredComponents?.[id]?.media_mention_mass ?? 0),
      delta_significance: ctx.historicalMass?.[id] ? inferDeltaSignificance(mass.evidenceMass, ctx.historicalMass[id]) : null,
    };
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
