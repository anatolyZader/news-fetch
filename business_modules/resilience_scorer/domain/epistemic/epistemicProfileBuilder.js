/**
 * Epistemic profile builder — count-based hints per component for agents/RAG.
 *
 * Pipeline position: after (or alongside) component evidence. Produces
 * `by_component[id]` fields consumed by specialist_agents prompts and
 * retrieval policies: thin_evidence, signal_count, contested, certainty_band,
 * distinct_article_count, dominance_warnings, delta_significance.
 *
 * Owns: computeEpistemicProfile and the mapping from evidence_basis bands →
 * agent-facing profile fields (including evidence_mass as a compat alias for
 * signal_count).
 *
 * Does NOT: run LLM assessment, invent headline scores, or mutate signals.
 * Delegates evidence assembly to buildComponentEvidence.
 *
 * Key collaborators: componentEvidence.js, assessmentOrchestrator.js,
 * retrieval policies under cross-cut-modules/retrieval/.
 */
import { COMPONENT_IDS } from '../contracts/componentIds.js';
import { buildComponentEvidence, SUFFICIENCY, BALANCE } from '../contracts/componentEvidence.js';

/** sufficiency band → coarse certainty label for agent prompts. */
const CERTAINTY_BAND_BY_SUFFICIENCY = {
  [SUFFICIENCY.none]: 'low',
  [SUFFICIENCY.thin]: 'low',
  [SUFFICIENCY.moderate]: 'medium',
  [SUFFICIENCY.adequate]: 'high',
};

/** balance band → polarization label for agent prompts. */
const POLARIZATION_BAND_BY_BALANCE = {
  [BALANCE.one_sided_pos]: 'one_sided',
  [BALANCE.one_sided_neg]: 'one_sided',
  [BALANCE.mixed]: 'mixed',
  [BALANCE.contested]: 'contested',
};

/** Turn concentration_warning into a list of human-readable dominance warnings. */
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

/**
 * Derive retrieval policy hints from the per-component profile (diversify
 * concentrated source types; require corroboration for thin/contested comps).
 */
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

/**
 * Map one component's evidence object → agent-facing epistemic profile row.
 * Preserves key names expected by specialist prompts / retrieval.
 */
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
 * Build the full epistemic profile for a signal batch.
 *
 * @param {object[]} signals metrics-eligible signals for this assess run
 * @param {{ reportDate?: string, weightOverlay?: object, assessmentEpistemic?: object }} [ctx]
 * @returns {{
 *   schema_version: string,
 *   report_date: string|null,
 *   by_component: Record<string, object>,
 *   retrieval_policies: object,
 *   assessment_epistemic: object,
 * }}
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
