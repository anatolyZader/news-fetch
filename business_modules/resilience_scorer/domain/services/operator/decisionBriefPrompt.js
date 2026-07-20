/**
 * Prompt blocks for batch operator decision brief (no re-scoring).
 */

import { buildAttentionItems } from './attentionItems.js';
import { DISPLAY_VIEWS, deriveInstrumentState } from './assessmentDisplayTier.js';
import { buildGroundingContext } from '../actionCompass/actionCompassGrounding.js';

const MAX_ATTENTION_ITEMS = 12;
const MAX_RECS = 10;
const MAX_COMPONENT_EXCERPTS = 8;
const NARRATIVE_SLICE = 280;

/**
 * @param {object} comp
 */
function formatComponentInstrumentLine(comp) {
  const inst = comp.instrument ?? deriveInstrumentState(comp);
  const id = comp.component_id ?? 'unknown';
  const operatorSuffix = inst.operator_status
    ? `, operator_status=${inst.operator_status}`
    : '';
  return (
    `- ${id}: confidence=${inst.confidence}, sufficiency=${inst.evidence_sufficiency}` +
    `${inst.contested ? ', contested' : ''}` +
    operatorSuffix
  );
}

/**
 * @param {object} assessment
 * @param {string} reportScopeId
 */
export function buildDecisionBriefPayload(assessment, reportScopeId = 'national') {
  const attentionItems = buildAttentionItems(assessment, {
    view: DISPLAY_VIEWS.operator,
    reportScopeId,
  }).slice(0, MAX_ATTENTION_ITEMS);

  const recs = (assessment.operator_recommendations ?? [])
    .filter((r) => r.status === 'pending')
    .slice(0, MAX_RECS);

  const components = (assessment.components ?? []).slice(0, MAX_COMPONENT_EXCERPTS);
  const componentLines = components.map((c) => {
    const instLine = formatComponentInstrumentLine(c);
    const narrative = c.narrative ? String(c.narrative).slice(0, NARRATIVE_SLICE) : '';
    return `${instLine}\n  narrative_excerpt: ${narrative || '(none)'}`;
  });

  const patterns = (assessment.pattern_alerts ?? []).slice(0, MAX_RECS);

  const ground = buildGroundingContext(assessment);
  const grounding = {
    affected_clusters: ground.cluster_names,
    affected_cluster_count: ground.cluster_count,
    dark_channels: ground.dark_channels,
    digital_darkness: ground.digital_darkness,
    quarantine: {
      active: ground.quarantine.active,
      since: ground.quarantine.since,
      days_active: ground.quarantine.day_count,
      quarantined_count: ground.quarantine.count,
    },
    social_channels: ground.social,
  };

  return {
    date: assessment.date ?? null,
    report_scope_id: reportScopeId,
    assessment_mode: assessment.assessment_mode ?? assessment.epistemic_status?.assessment_mode ?? 'normal',
    epistemic_status: assessment.epistemic_status ?? null,
    data_void: assessment.data_void ?? null,
    grounding,
    prior_brief_summary: assessment.prior_brief_summary ?? null,
    cross_component_synthesis: assessment.cross_component_synthesis
      ? String(assessment.cross_component_synthesis).slice(0, 1200)
      : '',
    attention_items: attentionItems,
    operator_recommendations: recs,
    pattern_alerts: patterns,
    component_instruments: componentLines.join('\n'),
  };
}

export function buildDecisionBriefSystemPrompt() {
  return (
    'You are an operator decision-support assistant for Israeli homefront community resilience assessments.\n' +
    'Produce a JSON object only — no markdown fences.\n\n' +
    'RULES:\n' +
    '- Do NOT assign or mention numeric 1–10 resilience scores.\n' +
    '- Cite only evidence from the supplied attention items, recommendations, and pattern alerts.\n' +
    '- If assessment_mode is "abstained" or sampling_status is "blind", the summary must state that metrics are withheld and operators should rely on field corroboration.\n' +
    '- Never contradict instrument abstention (insufficient_data, sampling_blind, limited_evidence_neutral).\n' +
    '- Do not invent new operator_recommendation IDs; reference only recommendation_id values provided.\n' +
    '- suggested_next_step must be advisory (review, clarify, monitor) — never claim resources were dispatched.\n' +
    '- SPECIFICITY (required): every suggested_next_step must name (a) a place/scope — use the grounding.affected_clusters names or the report scope; (b) a counterpart — one of: field team, PBO/community coordinator, regional authority, or chat/analyst; and (c) an observable success_signal stating how the operator will know it worked.\n' +
    '- Reject generic phrasing such as "review field corroboration protocols" — be concrete using the grounding facts (named clusters, dark channels, quarantine timing).\n' +
    '- If grounding is empty for an item, ground it in the report scope rather than omitting the place.\n' +
    '- where: short place/scope string. with_whom: the counterpart. success_signal: observable outcome.\n' +
    '- priority_items: at most 4 items, ranked by operational urgency. Prefer fewer, distinct items over many overlapping ones.\n' +
    '- CONCISENESS (required): each rationale is at most 2 sentences. State a shared fact (e.g. a quarantine count, digital darkness) ONCE — do not repeat the same situation across multiple items. Merge items that describe the same underlying problem.\n\n' +
    'OUTPUT JSON schema:\n' +
    '{\n' +
    '  "summary": "string (2-3 sentences, operator-safe, no repetition)",\n' +
    '  "priority_items": [\n' +
    '    {\n' +
    '      "attention_id": "string or null",\n' +
    '      "recommendation_id": "string or null",\n' +
    '      "level": "critical|warning|watch|info",\n' +
    '      "rationale": "string",\n' +
    '      "suggested_next_step": "string (names place + counterpart)",\n' +
    '      "where": "string or null",\n' +
    '      "with_whom": "string or null",\n' +
    '      "success_signal": "string or null"\n' +
    '    }\n' +
    '  ]\n' +
    '}'
  );
}

/**
 * @param {ReturnType<typeof buildDecisionBriefPayload>} payload
 */
export function buildDecisionBriefUserPrompt(payload) {
  return (
    `Assessment date: ${payload.date ?? 'unknown'}\n` +
    `Scope: ${payload.report_scope_id}\n` +
    `Assessment mode: ${payload.assessment_mode}\n` +
    `Epistemic status: ${JSON.stringify(payload.epistemic_status)}\n` +
    `Data void: ${JSON.stringify(payload.data_void)}\n` +
    `Grounding facts (use these for specificity):\n${JSON.stringify(payload.grounding, null, 2)}\n` +
    `Prior brief summary (for continuity): ${payload.prior_brief_summary || '(none)'}\n\n` +
    `Executive synthesis excerpt:\n${payload.cross_component_synthesis || '(none)'}\n\n` +
    `Component instruments (no scores):\n${payload.component_instruments || '(none)'}\n\n` +
    `Attention items:\n${JSON.stringify(payload.attention_items, null, 2)}\n\n` +
    `Pending operator recommendations:\n${JSON.stringify(payload.operator_recommendations, null, 2)}\n\n` +
    `Pattern alerts:\n${JSON.stringify(payload.pattern_alerts, null, 2)}\n`
  );
}
