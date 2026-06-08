/**
 * Map assessment.v2 to legacy-compatible assessment shape for API/redaction.
 */
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import { deriveInstrumentState } from '../../../resilience/index.js';
import { evidenceTreeFromGraph } from '../../../../cross-cut-modules/retrieval/evidenceGraph.js';

/**
 * @param {object} v2
 * @param {object} epistemicProfile
 * @param {object} [opts]
 */
export function mapAssessmentV2ToLegacy(v2, epistemicProfile, opts = {}) {
  const components = COMPONENT_IDS.map((id) => {
    const v2Comp = (v2.components ?? []).find((c) => c.component_id === id);
    const ep = epistemicProfile?.by_component?.[id] ?? {};
    const legacy = {
      component_id: id,
      severity: v2Comp?.severity ?? 'abstain',
      confidence: v2Comp?.confidence ?? 'low',
      operator_status: v2Comp?.operator_status ?? (ep.thin_evidence ? 'insufficient_data' : 'stable'),
      narrative: v2Comp?.narrative ?? '',
      narrative_claims: (v2Comp?.claims ?? []).map((c) => ({
        text: c.text,
        signal_refs: c.evidence_refs ?? [],
        relation: 'parallel',
      })),
      evidence: (v2Comp?.claims ?? []).map((c) => c.text).filter(Boolean),
      evidence_tree: v2Comp?.evidence_tree ?? evidenceTreeFromGraph({ claims: v2Comp?.claims }),
      reasoning_trace_id: v2Comp?.reasoning_trace_id ?? v2.agent_trace_id,
      dissent_summary: v2Comp?.dissent_summary ?? '',
      repair_log: v2Comp?.repair_log ?? [],
      retrieval_gaps: v2Comp?.retrieval_gaps ?? [],
    };
    legacy.instrument = deriveInstrumentState(
      {
        evidence_mass: ep.evidence_mass,
        polarization: ep.polarization,
        certainty: ep.certainty,
        contested: ep.contested,
        thin_evidence: ep.thin_evidence,
        narrative_grounding_score: v2Comp?.grounding_score,
      },
      { dataVoid: opts.dataVoid, epistemicStatus: opts.epistemicStatus },
    );
    return legacy;
  });

  return {
    ...v2,
    schema_version: v2.schema_version,
    date: v2.date,
    report_scope: v2.report_scope ?? { id: v2.report_scope_id ?? 'national' },
    total_articles_analyzed: v2.total_articles_analyzed ?? 0,
    cross_component_synthesis: v2.cross_component_synthesis ?? '',
    components,
    attention_items: v2.attention_items ?? [],
    decision_brief: v2.decision_brief ?? null,
    retrieval_gaps: v2.retrieval_gaps ?? [],
    agent_trace_id: v2.agent_trace_id,
    epistemic_profile_ref: v2.epistemic_profile_ref,
    overall_resilience_score: null,
    evidence_quality_note: v2.evidence_quality_note ?? '',
    norris_capacities: v2.norris_capacities ?? null,
  };
}
