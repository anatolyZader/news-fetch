import Anthropic from '@anthropic-ai/sdk';
import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';
import { summarizeConfidence, overallScore, scoreComponents } from '../domain/services/behaviorSignals.js';
import { computeNorrisCapacities } from '../domain/services/norrisCapacities.js';
import { narrativeIncludesScores } from '../domain/services/assessmentDisplayTier.js';
import { extractJson } from './claudeJsonHelpers.js';
import { streamWithProgress } from './claudeExtraction.js';

const client = new Anthropic();
const DEFAULT_NARRATIVE_MODEL = process.env.RESILIENCE_NARRATIVE_MODEL ?? 'claude-sonnet-4-6';

// ─── Step 2: Narrative generation ─────────────────────────────────────────────

function evidenceSufficiencyLabel(mass) {
  if (mass < 1.5) return 'thin';
  if (mass < 4) return 'moderate';
  return 'adequate';
}

function instrumentFloorTag(scored) {
  if (scored.floor_clamped) return '  thin_evidence_floor';
  if (scored.salience_critical) return '  critical_single_signal';
  return '';
}

function strengthDirectionLabel(strength) {
  if (strength == null) return 'unknown';
  return strength >= 0 ? 'net_positive' : 'net_negative';
}

function narrativeInstrumentLine(scored, totalArticles) {
  const insufficient = !scored ||
    (scored.score == null && scored.confidence === 'insufficient_data');
  if (insufficient) return 'Instrument: insufficient data';

  let certaintyPct = 'n/a';
  if (scored.certainty != null) {
    certaintyPct = `${(scored.certainty * 100).toFixed(0)}%`;
  }
  const mass = scored.evidence_mass ?? 0;
  let polTag = '';
  if (scored.polarization != null && scored.polarization > 0.5 && mass > 4) {
    polTag = '  contested';
  }
  const deltaTag = scored.delta_flag === 'significant' ? '  SIGNIFICANT_vs_baseline' : '';
  return (
    `Instrument: certainty=${certaintyPct}  direction=${strengthDirectionLabel(scored.strength)}` +
    `  evidence_sufficiency=${evidenceSufficiencyLabel(mass)}` +
    `  (${scored.distinct_article_count ?? 0}/${totalArticles} articles, ${scored.signal_count ?? 0} signals)` +
    `${polTag}${deltaTag}${instrumentFloorTag(scored)}`
  );
}

function polarizationPromptTag(scored) {
  if (scored?.polarization == null || scored.polarization <= 0.5) return '';
  const mass = scored.evidence_mass ?? 0;
  if (mass > 4) {
    return `  ⚠ contested (pol=${scored.polarization.toFixed(2)})`;
  }
  if (mass >= 1.5 && mass < 4) {
    return `  ⚠ contested_thin (pol=${scored.polarization.toFixed(2)}, mass=${mass})`;
  }
  return '';
}

function deltaPromptTag(scored) {
  if (scored?.delta_score == null) return '';
  const sign = scored.delta_score >= 0 ? '+' : '';
  let tag = `  Δvs prev: ${sign}${scored.delta_score}`;
  if (scored.delta_significance != null) tag += ` (z=${scored.delta_significance.toFixed(1)})`;
  if (scored.delta_flag === 'significant') tag += ' SIGNIFICANT';
  return tag;
}

function saliencePromptTag(scored) {
  if (scored?.salience_critical !== true) return '';
  return scored.floor_bypassed
    ? '  critical_single_signal_floor_bypassed'
    : '  critical_single_signal';
}

function formatScoredMetricsWithScores(scored, totalArticles) {
  if (scored?.score == null) return 'Score: insufficient data';
  const ciTag = scored.score_low != null && scored.score_high != null
    ? `  CI: ${scored.score_low}-${scored.score_high}` : '';
  const suppressTag = scored.suppression_delta != null && Math.abs(scored.suppression_delta) >= 1
    ? `  suppression: raw=${scored.score_raw ?? scored.score} headline=${scored.score_headline ?? scored.score} (Δ=${scored.suppression_delta})`
    : '';
  const mediaTag = scored.media_mention_mass != null && scored.media_mention_mass > 0
    ? `  press_mention_mass=${scored.media_mention_mass}`
    : '';
  const dirSign = scored.strength >= 0 ? '+' : '';
  return (
    `Score: ${scored.score}/10  Certainty: ${(scored.certainty * 100).toFixed(0)}%` +
    `  Direction: ${dirSign}${scored.strength.toFixed(2)}` +
    `  (${scored.distinct_article_count}/${totalArticles} articles, ${(scored.coverage_ratio * 100).toFixed(1)}%, ${scored.dispersion} dispersion)` +
    `  +ev:${scored.positive_evidence} −ev:${scored.negative_evidence}` +
    `${ciTag}${polarizationPromptTag(scored)}${suppressTag}${saliencePromptTag(scored)}${mediaTag}${deltaPromptTag(scored)}`
  );
}

function formatSignalBlock(signals) {
  return (signals ?? []).map((s) => {
    const fd = s.signal_file_date ? `  Source bundle date: ${s.signal_file_date}\n` : '';
    const urlLine = s.article_url ? `\n  URL: ${s.article_url}` : '';
    return (
      `  [${s.signal_type}] (scope:${s.scope_level ?? 'single_case'}, ev:${s.evidence_type ?? 'unknown'}, conf:${(s.extraction_confidence ?? 1).toFixed(2)})\n` +
      `${fd}  Evidence: "${s.evidence}"${urlLine}`
    );
  }).join('\n');
}

/**
 * Format the pre-scored component data + its signals for the narrative prompt.
 * @param {object} scoredComponents
 * @param {number} totalArticles
 * @param {{ includeScores?: boolean }} [opts]
 */
export function formatScoredComponentsForNarrative(scoredComponents, totalArticles, opts = {}) {
  const includeScores = opts.includeScores ?? narrativeIncludesScores();
  return RESILIENCE_COMPONENTS.map((compDef) => {
    const scored = scoredComponents[compDef.id];
    const conf = summarizeConfidence(scored?.confidence);
    const signalText = formatSignalBlock(scored?.signals);
    const metricsSummary = includeScores
      ? formatScoredMetricsWithScores(scored, totalArticles)
      : narrativeInstrumentLine(scored, totalArticles);
    const manifestations = compDef.behavioral_manifestations?.map((m, i) => `  ${i + 1}. ${m}`).join('\n')
      ?? '(none defined)';

    return (
      `**${compDef.id}** — ${compDef.name_en}\n` +
      `Confidence: ${conf}  ${metricsSummary}\n` +
      `Behavioral manifestations:\n${manifestations}\n` +
      `Signals extracted (${scored?.signal_count ?? 0}):\n${signalText || '  (none)'}`
    );
  }).join('\n\n---\n\n');
}

function significantDeltaDirection(deltaScore) {
  if (deltaScore > 0) return 'up';
  if (deltaScore < 0) return 'down';
  return 'shift';
}

function priorComponentTrendTags(c) {
  const tags = [`confidence=${c.confidence ?? 'n/a'}`];
  if (c.delta_flag === 'significant') {
    tags.push(`significant_delta_${significantDeltaDirection(c.delta_score ?? 0)}`);
  }
  if (c.polarization != null && c.polarization > 0.5 && (c.evidence_mass ?? 0) > 4) {
    tags.push('contested');
  }
  if (c.strength != null) {
    tags.push(c.strength >= 0 ? 'evidence_net_positive' : 'evidence_net_negative');
  }
  return tags.join(', ');
}

/**
 * Step 2: Generate component narratives.
 * Scoring is already done by code. Opus writes behavioral narratives only.
 *
 * @param {Object} scoredComponents  Output of scoreComponents() from behaviorSignals.js
 * @param {Array}  allSignals        All extracted signals
 * @param {string} date              YYYY-MM-DD
 * @param {number} totalArticles
 * @returns {Object}                 Assessment object with narratives merged into scored components
 */
function formatPriorReportsContext(priorReports, { includeScores } = {}) {
  if (!priorReports || priorReports.length === 0) return '';
  const useScores = includeScores ?? narrativeIncludesScores();
  const sections = priorReports.map((r) => {
    const compLines = (r.components ?? []).map((c) => {
      if (useScores) {
        return `    ${c.component_id.padEnd(28)} ${c.score ?? 'N/A'}/10`;
      }
      return `    ${c.component_id.padEnd(28)} ${priorComponentTrendTags(c)}`;
    }).join('\n');
    const header = useScores
      ? `[${r.date}] Overall: ${r.overall_resilience_score ?? 'N/A'}/10`
      : `[${r.date}] Prior-day instrument trends (no numeric scores)`;
    return `${header}\n${compLines}`;
  });
  const trajectoryNote = useScores
    ? 'Shows component scores only for earlier report dates.'
    : 'Shows instrument trend tags only (no numeric scores) for earlier report dates.';
  return (
    `━━━ PRIOR DAYS' CONTEXT (TREND ONLY) ━━━\n` +
    `${trajectoryNote} Use ONLY for trend wording (improving / declining / stable vs prior days).\n` +
    `Do NOT reuse factual geopolitical situations, timelines, treaty/ceasefire claims, battles, diplomacy, etc. from those days unless the SAME fact appears in TODAY's Evidence lines below.\n` +
    `Do not summarize or import earlier executive summaries.\n\n` +
    `${sections.join('\n\n')}\n\n`
  );
}

function formatComparisonScoresContext(scopeLabel, scoredComponents, { includeScores } = {}) {
  if (!scopeLabel || !scoredComponents) return '';
  const useScores = includeScores ?? narrativeIncludesScores();
  const compScores = RESILIENCE_COMPONENTS.map((def) => {
    const c = scoredComponents[def.id] ?? {};
    if (useScores) {
      return `- ${def.id}: ${c.score ?? 'n/a'}/10, confidence=${c.confidence ?? 'n/a'}, signals=${c.signal_count ?? 0}`;
    }
    return `- ${def.id}: ${priorComponentTrendTags(c)}, signals=${c.signal_count ?? 0}`;
  }).join('\n');
  const comparisonNote = useScores
    ? 'Use these pre-computed comparison scores as context only.'
    : 'Use these comparison instrument tags as context only (no numeric scores).';
  return (
    `━━━ COMPARISON CONTEXT: ${scopeLabel.toUpperCase()} ━━━\n` +
    `${comparisonNote} The report you are writing is for the requested scope; ` +
    `do not average comparison context into the scoped assessment. Mention differences only when analytically meaningful.\n` +
    `${compScores}\n\n`
  );
}

const AUDIO_NARRATIVE_CONTEXT =
  `━━━ SOURCE: SPOKEN AUDIO ━━━\n` +
  `Evidence comes from audio transcripts (not print news). Selection bias applies: hosts, guests, and call-ins are not a census of the population.\n` +
  `When few signals have URLs, omit source links; do not fabricate URLs.\n\n`;

const FIELD_REPORT_NARRATIVE_CONTEXT =
  `━━━ ADDITIONAL SOURCE: EXPERT FIELD REPORTS ━━━\n` +
  `Some signals originate from structured visits by trained resilience professionals to northern border communities.\n` +
  `These are primary observations — higher evidence quality than journalism, geographically specific to visited communities.\n` +
  `Field report signals cover populations often absent from news: elderly, Arab villages, small kibbutzim, special-needs individuals.\n` +
  `When field report signals appear alongside news signals for the same component, name both source types explicitly.\n` +
  `Field report signals have no URL — do not fabricate links for them.\n\n`;

const NAFTALI_NARRATIVE_CONTEXT =
  `━━━ ADDITIONAL SOURCE: NAFTALI WEEKLY QUESTIONNAIRE ━━━\n` +
  `Some signals originate from Naftali weekly questionnaire responses filled by municipal welfare departments.\n` +
  `CRITICAL SCOPE LIMITATION: Naftali data covers ONE sub-region out of five in northern Israel. ` +
  `It does NOT represent the entire northern population. Any findings based on Naftali signals ` +
  `MUST explicitly state they are specific to the Naftali sub-region and cannot be generalized to the broader north.\n` +
  `When citing Naftali evidence in narratives, always qualify: "In the Naftali sub-region, ..." or "Naftali-region municipalities report..."\n` +
  `Do not blend Naftali findings into general population statements without marking the geographic scope.\n` +
  `Naftali signals have no URL — do not fabricate links for them.\n\n`;

function formatMacroSignalsContext(macroSignals) {
  if (!Array.isArray(macroSignals) || macroSignals.length === 0) return '';
  const lines = macroSignals.slice(0, 25).map((s) => {
    const type = s.signal_type ?? s.type ?? 'macro';
    const ev = String(s.evidence ?? '').slice(0, 220);
    return `  [${type}] ${ev}`;
  });
  return (
    `━━━ MACRO / NATIONAL INFORMATION ENVIRONMENT (context only — NOT in component scores) ━━━\n` +
    `Use for national backdrop in cross_component_synthesis only. Do NOT cite as northern behavioral metrics.\n` +
    `${lines.join('\n')}\n\n`
  );
}

const NARRATIVE_RULES_BLOCK =
  `━━━ NARRATIVE RULES ━━━\n` +
  `- Describe what people ARE DOING, SAYING, or EXPERIENCING — not abstract assessments\n` +
  `- Use the signal evidence as your source material; quote evidence directly when possible\n` +
  `- Do not adopt journalist framing — translate it into behavioral observations\n` +
  `- Keep narratives to 3–5 sentences per component\n` +
  `- LANGUAGE REGISTER: Use formal, measured, neutral language throughout. This is a professional assessment document, not journalism.\n` +
  `  Avoid emotional amplifiers: words like sharp, acute, severe, stark, devastating, remarkable, striking, alarming, gripping, intense.\n` +
  `  Describe degree through evidence (counts, frequencies, proportions) rather than adjectives.\n` +
  `  Wrong: "Two sharply contradictory behavioral narratives" — Right: "Two contradictory behavioral narratives"\n` +
  `  Wrong: "Residents are gripped by acute fear" — Right: "Residents report difficulty sleeping and returning to shelters repeatedly"\n` +
  `- DIFFERENTIAL FUNCTIONING: For each component, actively look for splits within it — one sub-domain working while another fails, one population reached while another isn't, one channel functional while another is absent.\n` +
  `  Name the split explicitly. Do not flatten it into a single verdict. This is the most actionable form of analysis.\n` +
  `  Example: "Shelter communication is structured and reaches residents — but operational guidance for economic and daily-life decisions is absent, leaving business owners making random choices with no state input."\n` +
  `- ABSENCE OF EVIDENCE: Each component definition lists its expected behavioral manifestations. For every manifestation that has zero signals:\n` +
  `  Step 1 — decide which interpretation applies:\n` +
  `    (a) Informative absence: the behavior is expected under current conditions but did not appear in reporting. Name it: "No evidence of X was found in today's sample."\n` +
  `    (b) Reporting gap: the absence likely reflects what journalists chose to cover, not what is actually happening.\n` +
  `  Step 2 — never silently skip absent manifestations. A component with 1 signal and 4 unaddressed manifestations is analytically different from a component with 5 evidenced signals.\n` +
  `  Step 3 — do not over-weight components that happen to have more signals. Signal count reflects reporting intensity, not necessarily prevalence of the phenomenon.\n` +
  `  List absent manifestations in the "manifestations_absent" array; include a parenthetical interpretation: (informative absence) or (likely reporting gap).\n` +
  `- INFORMATION EFFECTIVENESS (information_communication component): Distinguish between information presence and information effectiveness. Clarity of delivery is not the same as fitness for purpose.\n` +
  `  Ask: could people actually follow the guidance given their real constraints? Did it cover the scenario they faced?\n` +
  `  A component may show: clear wide-distribution of shelter guidance (presence) alongside complete absence of guidance on economic decisions or mass-casualty scenarios (effectiveness gap).\n` +
  `  Name this split explicitly. E.g.: "Shelter instructions reached residents through multiple channels — but no guidance was issued for workers without legal protection to stop, and mass-casualty scenarios were not addressed in official messaging."\n` +
  `  Use information_actionable_effective signals to evidence the presence-effectiveness link; use information_effectiveness_gap signals to evidence the gap.\n` +
  `- BASELINE VS ELEVATED SERVICE FUNCTIONING: Baseline service operation (ambulance responded, hospital treated) is neutral, not positive evidence. Only cite service functioning as strong when it demonstrably performed despite disruption or elevated demand.\n` +
  `- DELTA + CONTESTED EVIDENCE TAGS: When a component's pre-computed line shows "SIGNIFICANT" or "SIGNIFICANT_vs_baseline", include a brief trend phrase ("a notable shift vs the 14-day baseline"). When it shows "contested", note that the evidence is split between supporting and opposing observations rather than collapsing to a single verdict. Do not invent direction or magnitude beyond what the instrument tags say.\n` +
  `- THIN EVIDENCE / ABSTENTION: When instrument tags include thin_evidence_floor, limited_evidence_neutral, or unverified_alert, do NOT use stability language ("calm", "stable", "normal"). For unverified_alert, lead with "a single unverified report suggests…" and recommend corroboration. For critical_single_signal, lead with "one verified high-stakes report indicates…", state corroboration is still limited, and do NOT treat the situation as stable.\n` +
  `- SUPPRESSION: When suppression_delta is large (|Δ|≥1), note that raw signal stream differed from the headline-adjusted assessment and explain why (e.g. single-source concentration).\n` +
  `- SCOPE DISCIPLINE: Never use "the only", "the one exception", "uniquely", or similar exclusive claims.\n` +
  `  The inputs are a sample, not a census. Something appearing once in the data means it was reported once — not that it is the sole instance.\n` +
  `- LINKS: Each signal has a URL. When a signal has a URL, embed a markdown link for every significant claim:\n` +
  `    In narrative: append ([source](URL)) after the relevant sentence\n` +
  `    In evidence items: append ([source](URL)) at end of the item\n` +
  `    If a signal has no URL, omit the link — do not fabricate URLs\n\n`;

function buildGroundingContext(date) {
  return (
    `━━━ GROUND TRUTH & DATE DISCIPLINE ━━━\n` +
    `Assessment anchor date for this JSON output: ${date}.\n` +
    `- The "Signals extracted" Evidence blocks ARE the allowable facts for TODAY's behavior picture. Treat each bundle-date line (when shown) as the dated provenance for that excerpt.\n` +
    `- cross_component_synthesis and every component narrative must only assert situations that fair readers could trace back to TODAY's Evidence text. You may add trend phrases using PRIOR DAYS' CONTEXT only when explicitly comparing score trajectories—never as a source of new factual events.\n` +
    `- Do not use independent world knowledge of Israel/Lebanon, military operations, treaties, diplomacy, or ceasefires—even if widely known or plausible.\n` +
    `- Do not state timelines (e.g. "at midnight", "entered into force", "day N of truce") unless that exact timetable or factual claim appears inside the Evidence strings you rely on.\n` +
    `- If evidence records expectations, rumours, or reported statements, phrase them strictly as attributed communications or observed reporting—never as externally verified geopolitical facts.\n` +
    `- When evidence conflicts, surface the conflict; do not resolve it from outside facts.\n\n`
  );
}

function buildDataVoidContext(dataVoid) {
  if (!dataVoid?.level || dataVoid.level === 'none') return '';
  return (
    `━━━ DATA VOID / DIGITAL DARKNESS ━━━\n` +
    `Critical sampling gap detected (level=${dataVoid.level}, digital_darkness=${dataVoid.digital_darkness === true}).\n` +
    `You MUST NOT describe the situation as stable or calm due to lack of reports.\n` +
    `Lead with a warning that evidence is critically insufficient and may reflect connectivity failure.\n\n`
  );
}

function buildScopeContext(reportScope) {
  if (reportScope?.id !== 'north') return '';
  return (
    `━━━ REPORT SCOPE: NORTHERN ISRAEL ━━━\n` +
    `Write this assessment as a northern-region report, focused on civilians and communities in northern Israel. ` +
    `Use national context only as comparison. Be explicit when evidence is from a sub-region such as Naftali and avoid generalizing it to the whole north.\n\n`
  );
}

function buildNarrativeSystemPrompt({
  includeScoresInPrompt,
  scoredComponents,
  totalArticles,
  date,
  priorContext,
  comparisonContext,
  scopeContext,
  dataVoidContext,
  contentKind,
  sourceTypes,
  macroSignals,
}) {
  const scoreIntro = includeScoresInPrompt
    ? `The component SCORES are already computed — do not re-score. Your job is to write clear, behavioral narratives.\n\n`
    : `Component instrument tags (certainty, direction, sufficiency) are pre-computed — do not invent numeric 1–10 ratings. Your job is to write clear, behavioral narratives grounded in Evidence lines.\n\n`;
  const componentsBlock = formatScoredComponentsForNarrative(scoredComponents, totalArticles, {
    includeScores: includeScoresInPrompt,
  });
  const metricsLabel = includeScoresInPrompt ? 'scores' : 'instrument tags';

  return (
    `You are a community resilience analyst writing behavioral narratives for a structured report.\n` +
    scoreIntro +
    scopeContext +
    dataVoidContext +
    formatMacroSignalsContext(macroSignals) +
    (contentKind === 'audio' ? AUDIO_NARRATIVE_CONTEXT : '') +
    (sourceTypes.has('field') ? FIELD_REPORT_NARRATIVE_CONTEXT : '') +
    (sourceTypes.has('naftali') ? NAFTALI_NARRATIVE_CONTEXT : '') +
    (priorContext || '') +
    (comparisonContext || '') +
    buildGroundingContext(date) +
    NARRATIVE_RULES_BLOCK +
    `━━━ THE 8 COMPONENTS (with pre-computed ${metricsLabel} and signals) ━━━\n\n` +
    `${componentsBlock}\n\n` +
    `━━━ OUTPUT FORMAT ━━━\n` +
    `Return ONLY valid JSON:\n` +
    `{\n` +
    `  "cross_component_synthesis": "<2 paragraphs — behavioral summary across all 8 components. Must satisfy GROUND TRUTH & DATE DISCIPLINE: only facts supported by Evidence lines in this run; no outside knowledge. When choosing illustrative examples, select only those that are analytically distinctive: they represent a different population type, behavior mode, or structural condition not already covered by another example. Do not include examples that are emotionally striking but analytically equivalent to many other signals (e.g., a single shelter-compliance instance when dozens exist). Prefer examples that illuminate a structural split, a failure mode, or a population otherwise absent from reporting.>",\n` +
    `  "evidence_quality_note": "<1 sentence on signal quality today: proportion of direct quotes vs reported facts>",\n` +
    `  "components": [\n` +
    `    {\n` +
    `      "component_id": "<id>",\n` +
    `      "manifestations_evidenced": ["<manifestation string>", ...],\n` +
    `      "manifestations_absent": ["<manifestation string> (informative absence | likely reporting gap)", ...],\n` +
    `      "evidence": ["<all behavioral evidence items for this component, each with ([source](URL)) if a URL is available>", ...],\n` +
    `      "narrative": "<3–5 sentence behavioral narrative>"\n` +
    `    }, ...\n` +
    `  ]\n` +
    `}`
  );
}

function topContributorsFromScored(scored) {
  return (scored.signals ?? [])
    .filter((s) => typeof s._contribution === 'number')
    .sort((a, b) => Math.abs(b._contribution) - Math.abs(a._contribution))
    .slice(0, 10)
    .map((s) => ({
      signal_type: s.signal_type ?? s.type ?? null,
      source_type: s.source_type ?? null,
      article_source: s.article_source ?? null,
      article_url: s.article_url ?? null,
      evidence: s.evidence ?? null,
      _contribution: s._contribution,
      _contribution_pre_cap: s._contribution_pre_cap ?? null,
      _contribution_raw: s._contribution_raw ?? null,
      _cap_scale_factor: s._cap_scale_factor ?? null,
      _cap_layer: s._cap_layer ?? null,
      _weight: s._weight,
      _polarity: s._polarity,
    }));
}

function buildAssessmentComponent(def, scored, narr) {
  return {
    component_id: def.id,
    score: scored.score ?? null,
    confidence: scored.confidence ?? 'insufficient_data',
    signal_count: scored.signal_count ?? 0,
    distinct_article_count: scored.distinct_article_count ?? 0,
    source_diversity: scored.source_diversity ?? 0,
    coverage_ratio: scored.coverage_ratio ?? 0,
    dispersion: scored.dispersion ?? null,
    coverage_adjustment: scored.coverage_adjustment ?? 0,
    source_diversity_factor: scored.source_diversity_factor ?? 0,
    type_diversity_factor: scored.type_diversity_factor ?? 0,
    signal_type_entropy: scored.signal_type_entropy ?? 0,
    positive_evidence: scored.positive_evidence ?? 0,
    negative_evidence: scored.negative_evidence ?? 0,
    net_evidence: scored.net_evidence ?? 0,
    evidence_mass: scored.evidence_mass ?? 0,
    strength: scored.strength ?? 0,
    adjusted_strength: scored.adjusted_strength ?? 0,
    certainty: scored.certainty ?? 0,
    polarization: scored.polarization ?? 0,
    score_low: scored.score_low ?? null,
    score_high: scored.score_high ?? null,
    counterfactual_article_key: scored.counterfactual_article_key ?? null,
    counterfactual_delta: scored.counterfactual_delta ?? null,
    counterfactual_no_caps: scored.counterfactual_no_caps ?? scored.score_raw ?? null,
    score_smoothed: scored.score_smoothed ?? null,
    delta_score: scored.delta_score ?? null,
    delta_significance: scored.delta_significance ?? null,
    delta_flag: scored.delta_flag ?? null,
    floor_clamped: scored.floor_clamped === true,
    ci_unstable: scored.ci_unstable === true,
    source_cap_binding: scored.source_cap_binding === true,
    derived_indicators: scored.derived_indicators ?? null,
    score_raw: scored.score_raw ?? null,
    score_headline: scored.score_headline ?? scored.score ?? null,
    suppression_delta: scored.suppression_delta ?? null,
    delta_chronic: scored.delta_chronic ?? null,
    z_score_chronic: scored.z_score_chronic ?? null,
    erosion_index: scored.erosion_index ?? null,
    exhaustion_days: scored.exhaustion_days ?? null,
    cumulative_deficit: scored.cumulative_deficit ?? null,
    media_mention_mass: scored.media_mention_mass ?? null,
    suppression_breakdown: scored.suppression_breakdown ?? null,
    facets: scored.facets ?? null,
    top_contributors: topContributorsFromScored(scored),
    manifestations_evidenced: narr.manifestations_evidenced ?? [],
    manifestations_absent: narr.manifestations_absent ?? [],
    evidence: narr.evidence ?? [],
    narrative: narr.narrative ?? '',
  };
}

function buildAssessmentPayload(narratives, scoredComponents, meta) {
  const componentMap = Object.fromEntries(
    (narratives.components ?? []).map((c) => [c.component_id, c]),
  );
  const components = RESILIENCE_COMPONENTS.map((def) => {
    const scored = scoredComponents[def.id] ?? {};
    const narr = componentMap[def.id] ?? {};
    return buildAssessmentComponent(def, scored, narr);
  });

  return {
    date: meta.date,
    ...(meta.reportScope ? { report_scope: meta.reportScope } : {}),
    total_articles_analyzed: meta.totalArticles,
    overall_resilience_score: overallScore(scoredComponents),
    content_kind: meta.contentKind,
    cross_component_synthesis: narratives.cross_component_synthesis ?? '',
    evidence_quality_note: narratives.evidence_quality_note ?? '',
    norris_capacities: computeNorrisCapacities(scoredComponents, scoredComponents),
    components,
    ...(meta.macroSignals?.length ? { macro_signals: meta.macroSignals.slice(0, 50) } : {}),
    ...(meta.dataVoid ? { data_void: meta.dataVoid } : {}),
    ...(meta.oovCaptureCount > 0 ? { oov_capture_count: meta.oovCaptureCount } : {}),
    ...(meta.allScopedSignals ? { scoped_signal_count: meta.allScopedSignals.length } : {}),
  };
}

export async function generateNarratives(
  scoredComponents,
  _allSignals,
  date,
  totalArticles,
  {
    onUsage,
    _onProgress,
    priorReports,
    contentKind = 'news',
    sourceTypes = new Set(),
    reportScope = null,
    comparisonScores = null,
    comparisonLabel = null,
    macroSignals = [],
    allScopedSignals = null,
    dataVoid = null,
    oovCaptureCount = 0,
  } = {},
) {
  const includeScoresInPrompt = narrativeIncludesScores();
  const priorContext = formatPriorReportsContext(priorReports, { includeScores: includeScoresInPrompt });
  const comparisonContext = formatComparisonScoresContext(comparisonLabel, comparisonScores, {
    includeScores: includeScoresInPrompt,
  });
  const systemPrompt = buildNarrativeSystemPrompt({
    includeScoresInPrompt,
    scoredComponents,
    totalArticles,
    date,
    priorContext,
    comparisonContext,
    scopeContext: buildScopeContext(reportScope),
    dataVoidContext: buildDataVoidContext(dataVoid),
    contentKind,
    sourceTypes,
    macroSignals,
  });
  const userContent =
    `Assessment anchor date: ${date}\nTotal articles counted for coverage: ${totalArticles}\n\n` +
    `Write behavioral narratives for all 8 components based on the signals above. Facts must trace to Evidence text in this payload only.\n`;
  const meta = {
    date,
    reportScope,
    totalArticles,
    contentKind,
    macroSignals,
    dataVoid,
    oovCaptureCount,
    allScopedSignals,
  };

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const label = attempt > 1 ? `[Step 2 — Narratives] (retry ${attempt})` : '[Step 2 — Narratives]';
      const stream = client.messages.stream({
        model: DEFAULT_NARRATIVE_MODEL,
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });
      await streamWithProgress(stream, label);
      const message = await stream.finalMessage();
      if (onUsage) onUsage({ label: '[Step 2 — Narratives]', model: DEFAULT_NARRATIVE_MODEL, usage: message.usage });
      const textBlock = message.content.find((b) => b.type === 'text');
      if (!textBlock) throw new Error('Step 2: no text block');
      const narratives = extractJson(textBlock.text);
      return buildAssessmentPayload(narratives, scoredComponents, meta);
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.error(`  ⚠ Step 2 attempt ${attempt} failed (${err.message}) — retrying in ${5 * attempt}s...`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

// Backwards-compat: synthesizeComponents wraps the new two-step (score + narrate)
// so that api/analysisService.js and cross-cut-modules/budget token audit continue to work.

export async function synthesizeComponents(signals, date, totalArticles, { onUsage, onProgress, contentKind } = {}) {
  const scored = scoreComponents(signals, { totalArticles });
  return generateNarratives(scored, signals, date, totalArticles, { onUsage, onProgress, contentKind });
}