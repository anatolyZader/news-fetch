/**
 * Compute epistemic hints per component from the count-based evidence contract
 * (no headline scores, no evidence mass). Key names are preserved for the
 * specialist-agent prompts and retrieval policies that consume
 * `by_component[id]`: thin_evidence, signal_count, contested, certainty_band,
 * distinct_article_count, dominance_warnings, delta_significance.
 */
import { COMPONENT_IDS } from '../contracts/componentIds.js';
import { buildComponentEvidence, SUFFICIENCY, BALANCE } from '../contracts/componentEvidence.js';

const CERTAINTY_BAND_BY_SUFFICIENCY = {
  [SUFFICIENCY.none]: 'low',
  [SUFFICIENCY.thin]: 'low',
  [SUFFICIENCY.moderate]: 'medium',
  [SUFFICIENCY.adequate]: 'high',
};

const POLARIZATION_BAND_BY_BALANCE = {
  [BALANCE.one_sided_pos]: 'one_sided',
  [BALANCE.one_sided_neg]: 'one_sided',
  [BALANCE.mixed]: 'mixed',
  [BALANCE.contested]: 'contested',
};

function dominanceWarnings(basis) {
  const w = basis.concentration_warning;
  if (!w) return [];
  return [{
    layer: w.layer,
    key: w.key,
    share: w.share,
    message: `${w.layer} "${w.key}" holds ${Math.round(w.share * 100)}% of this component's signals`,
  }];
}

function buildRetrievalPolicies(byComponent) {
  const diversify = [];
  const boost = [];
  const require_corroboration = [];

  for (const [componentId, comp] of Object.entries(byComponent)) {
    for (const w of comp.dominance_warnings ?? []) {
      if (w.layer === 'source_type') {
        diversify.push({ source_type: w.key, max_share: w.share });
      }
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

function profileFromEvidence(ev) {
  const basis = ev.evidence_basis;
  return {
    signal_count: basis.signal_count,
    distinct_article_count: basis.distinct_articles,
    source_diversity: basis.distinct_sources,
    positive_count: basis.positive_count,
    negative_count: basis.negative_count,
    sufficiency: basis.sufficiency,
    balance: basis.balance,
    thin_evidence: basis.sufficiency === SUFFICIENCY.none || basis.sufficiency === SUFFICIENCY.thin,
    contested: basis.balance === BALANCE.contested,
    certainty_band: CERTAINTY_BAND_BY_SUFFICIENCY[basis.sufficiency] ?? 'low',
    polarization_band: POLARIZATION_BAND_BY_BALANCE[basis.balance] ?? null,
    dominance_warnings: dominanceWarnings(basis),
    delta_significance: null,
    // Compat alias for prompt templates written against the mass profile.
    evidence_mass: basis.signal_count,
  };
}

/**
 * @param {object[]} signals
 * @param {{ reportDate?: string, weightOverlay?: object, assessmentEpistemic?: object }} [ctx]
 */
export function computeEpistemicProfile(signals, ctx = {}) {
  const { by_component: evidence } = buildComponentEvidence(signals ?? [], {
    weightOverlay: ctx.weightOverlay ?? null,
  });

  const byComponent = {};
  for (const id of COMPONENT_IDS) {
    byComponent[id] = profileFromEvidence(evidence[id]);
  }

  return {
    schema_version: '2.0',
    report_date: ctx.reportDate ?? null,
    by_component: byComponent,
    retrieval_policies: buildRetrievalPolicies(byComponent),
    assessment_epistemic: ctx.assessmentEpistemic ?? {},
  };
}
