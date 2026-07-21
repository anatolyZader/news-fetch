/**
 * Epistemic profile builder — count-based hints per component for agents and RAG.
 *
 * Pipeline position: assess — after buildComponentEvidence; output feeds specialist prompts and retrieval.
 *
 * Owns: computeEpistemicProfile and mapping from evidence_basis bands → agent-facing profile fields.
 * Does NOT: run LLM assessment, mutate signals, or emit numeric resilience scores (min-math).
 *
 * Key collaborators: componentEvidence.js, assessmentOrchestrator.js, thinEvidencePolicy.js, retrieval policies.
 */
import { COMPONENT_IDS } from '../contracts/componentIds.js';
import { buildComponentEvidence, SUFFICIENCY, BALANCE } from '../contracts/componentEvidence.js';

// --- Band → prompt label maps ---

/**
 * Sufficiency band → coarse certainty label for specialist agent prompts.
 * @type {Record<string, string>}
 */
const CERTAINTY_BAND_BY_SUFFICIENCY = {
  [SUFFICIENCY.none]: 'low',
  [SUFFICIENCY.thin]: 'low',
  [SUFFICIENCY.moderate]: 'medium',
  [SUFFICIENCY.adequate]: 'high',
};

/**
 * Balance band → polarization label for specialist agent prompts.
 * @type {Record<string, string>}
 */
const POLARIZATION_BAND_BY_BALANCE = {
  [BALANCE.one_sided_pos]: 'one_sided',
  [BALANCE.one_sided_neg]: 'one_sided',
  [BALANCE.mixed]: 'mixed',
  [BALANCE.contested]: 'contested',
};

// --- Per-component profile assembly ---

/**
 * Turn evidence_basis.concentration_warning into human-readable dominance warnings.
 * @param {object} basis — component evidence_basis object
 * @returns {Array<{ layer: string, key: string, share: number, message: string }>}
 */
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
 * Derive retrieval policy hints from the per-component profile.
 * Diversify concentrated source types; require corroboration for thin/contested components.
 *
 * @param {Record<string, object>} byComponent
 * @returns {{ diversify: object[], boost: object[], require_corroboration: object[] }}
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
 * Uses signal_count as the canonical count field; evidence_mass is a compat alias.
 *
 * @param {object} ev — single component from buildComponentEvidence output
 * @returns {object}
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
 * Build the full epistemic profile for a signal batch (count-based, no numeric scores).
 *
 * @param {object[]} signals — metrics-eligible signals for this assess run
 * @param {{ reportDate?: string, assessmentEpistemic?: object }} [ctx]
 * @returns {{
 *   schema_version: string,
 *   report_date: string|null,
 *   by_component: Record<string, object>,
 *   retrieval_policies: object,
 *   assessment_epistemic: object,
 * }}
 */
export function computeEpistemicProfile(signals, ctx = {}) {
  const { by_component: evidence } = buildComponentEvidence(signals ?? []);

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
