import Anthropic from '@anthropic-ai/sdk';
import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';
import { summarizeConfidence } from '../domain/services/behaviorSignals.js';
import { overallScore, scoreComponents } from '../app/scoringFacade.js';
import { salienceContextFromDataVoid } from '../domain/services/highSalienceBypass.js';
import { computeNorrisCapacities } from '../domain/services/norrisCapacities.js';
import { narrativeIncludesScores } from '../domain/services/assessmentDisplayTier.js';
import {
  buildSignalRefRegistry,
  formatCoOccurrenceForPrompt,
  formatSignalWithRef,
  formatSuppressionDataQualityBlock,
  formatSuppressionTraceTag,
  formatSignalContributionSuffix,
  validateNarrativeOutput,
  formatValidationFeedback,
  validateSuppressionCompliance,
  formatSuppressionFeedback,
  computeGroundingScores,
  isNarrativeGroundingEnabled,
  isNarrativeFactsPassEnabled,
  isNarrativeJudgeEnabled,
  isNarrativeGroundingBlockEnabled,
  narrativeGroundingMinScore,
} from '../domain/services/narrativeGrounding/index.js';
import { topContributorsFromScored } from '../domain/services/topContributors.js';
import { extractJson } from './claudeJsonHelpers.js';
import { streamWithProgress } from './claudeExtraction.js';
import { extractNarrativeFacts } from './narrativeFactsExtract.js';
import { buildNarrativeRetrievalContext } from './narrativeRetrievalContext.js';
import { judgeNarrativeRelations, formatJudgeFeedback } from './narrativeRelationJudge.js';

const client = new Anthropic();
const DEFAULT_NARRATIVE_MODEL = process.env.RESILIENCE_NARRATIVE_MODEL ?? 'claude-sonnet-4-6';

// ─── Step 2: Narrative generation ─────────────────────────────────────────────

function evidenceSufficiencyLabel(mass) {
  if (mass < 1.5) return 'thin';
  if (mass < 4) return 'moderate';
  return 'adequate';
}

function instrumentFloorTag(scored) {
  if (scored.presence_gate_triggered) return '  critical_presence_gate';
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
  const suppressTag = suppressionTracePromptTag(scored);
  return (
    `Instrument: certainty=${certaintyPct}  direction=${strengthDirectionLabel(scored.strength)}` +
    `  evidence_sufficiency=${evidenceSufficiencyLabel(mass)}` +
    `  (${scored.distinct_article_count ?? 0}/${totalArticles} articles, ${scored.signal_count ?? 0} signals)` +
    `${polTag}${deltaTag}${instrumentFloorTag(scored)}${suppressTag}`
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

export function suppressionTracePromptTag(scored) {
  return formatSuppressionTraceTag(scored);
}

function formatScoredMetricsWithScores(scored, totalArticles) {
  if (scored?.score == null) return 'Score: insufficient data';
  const ciTag = scored.score_low != null && scored.score_high != null
    ? `  CI: ${scored.score_low}-${scored.score_high}` : '';
  const suppressTag = suppressionTracePromptTag(scored);
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

function geoAuditTagsForSignal(s) {
  const g = s?.geo;
  if (g?.kind !== 'resolved') return '';
  const prov = g.resolution?.provenance;
  const parts = [];
  if (prov) parts.push(`geo:provenance=${prov}`);
  if (s.metricsEligible === false) parts.push('metricsEligible=false');
  const scopeConf = g.policy?.scopeConfidence ?? g.scopeConfidence;
  if (scopeConf) parts.push(`scopeConfidence=${scopeConf}`);
  return parts.length ? `\n  Geo audit: ${parts.join(' ')}` : '';
}

function formatSignalBlock(signals, registryEntries) {
  if (registryEntries?.length) {
    return registryEntries.map((e) => formatSignalWithRef(e.signal, e)).join('\n\n');
  }
  return (signals ?? []).map((s) => {
    const fd = s.signal_file_date ? `  Source bundle date: ${s.signal_file_date}\n` : '';
    const urlLine = s.article_url ? `\n  URL: ${s.article_url}` : '';
    const geoTags = geoAuditTagsForSignal(s);
    return (
      `  [${s.signal_type}] (scope:${s.scope_level ?? 'single_case'}, ev:${s.evidence_type ?? 'unknown'}, conf:${(s.extraction_confidence ?? 1).toFixed(2)})\n` +
      `${fd}  Evidence: "${s.evidence}"${urlLine}${geoTags}${formatSignalContributionSuffix(s)}`
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
  const registry = opts.registry ?? null;
  return RESILIENCE_COMPONENTS.map((compDef) => {
    const scored = scoredComponents[compDef.id];
    const conf = summarizeConfidence(scored?.confidence);
    const registryEntries = registry?.byComponent?.[compDef.id] ?? null;
    const signalText = formatSignalBlock(scored?.signals, registryEntries);
    const metricsSummary = includeScores
      ? formatScoredMetricsWithScores(scored, totalArticles)
      : narrativeInstrumentLine(scored, totalArticles);
    const suppressionContext = formatSuppressionDataQualityBlock(scored);
    const manifestations = compDef.behavioral_manifestations?.map((m, i) => `  ${i + 1}. ${m}`).join('\n')
      ?? '(none defined)';

    return (
      `**${compDef.id}** — ${compDef.name_en}\n` +
      `Confidence: ${conf}  ${metricsSummary}\n` +
      (suppressionContext ? `${suppressionContext}\n` : '') +
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
    `FORBIDDEN from prior reports: narratives, actors, places, events, timelines, treaty/ceasefire claims, battles, diplomacy — unless the SAME fact appears verbatim in TODAY's Evidence lines below.\n` +
    `Do not summarize or import earlier executive summaries or component narratives.\n` +
    `Prior context supplies trend tags only — never factual content for today's narrative.\n\n` +
    `${sections.join('\n\n')}\n\n`
  );
}

function formatComparisonScoresContext(scopeLabel, scoredComponents, { includeScores, comparable = true } = {}) {
  if (!scopeLabel || !scoredComponents) return '';
  if (comparable === false) {
    return (
      `━━━ COMPARISON CONTEXT: ${String(scopeLabel).toUpperCase()} (NOT COMPARABLE) ━━━\n` +
      `Regional and national source mixes differ too much for valid score comparison. ` +
      `Do NOT cite national comparison scores or imply regional/national parity. ` +
      `Describe scoped evidence only.\n\n`
    );
  }
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

const NARRATIVE_ANTI_RELATIONSHIP_BLOCK =
  `━━━ ANTI-RELATIONSHIP RULES (CO-OCCURRENCE ≠ CONNECTION) ━━━\n` +
  `- Signals sharing a theme or appearing in the same component do NOT imply a causal or explanatory link.\n` +
  `- FORBIDDEN connectives linking unrelated refs: because, therefore, as a result, led to, driven by, in response to, despite, due to, consequently, thus, hence.\n` +
  `- Multi-ref claims (≥2 signal_refs): use relation=parallel and phrasing like "Separately…" — never causal connectives between refs.\n` +
  `- signal_ref values MUST match the input exactly (type@url:… or [S#] as shown). Do NOT invent refs like signal_type@idx:N unless that exact string appears in Evidence.\n` +
  `- ALLOWED phrasing: "Separately…", "In parallel…", "One report describes… while another describes…", "No shared evidence links…"\n` +
  `- relation=same_article_only requires all cited signal_refs to share the same article_url.\n` +
  `- Epistemic framing by evidence_type: direct_quote → attributed quote; institutional → "According to…"; observational → "Reporting describes…"\n\n` +
  `FEW-SHOT (bad → good):\n` +
  `BAD: "Residents expressed fear because compliance with shelter instructions was high" (links fear@url:A with compliance@url:B)\n` +
  `GOOD: "One report describes residents expressing fear ([S1]). Separately, another describes shelter compliance ([S2]). No shared evidence links these observations."\n\n` +
  `EVIDENCE-FIRST WORKFLOW:\n` +
  `1. Fill evidence[] (≥70% overlap with Evidence lines; cite [S#]).\n` +
  `2. Fill narrative_claims (≥1 signal_ref each; correct relation tag).\n` +
  `3. Write narrative from claims/evidence only; delete unsupported sentences.\n` +
  `4. Write cross_component_synthesis per bullet rules.\n\n`;

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
  `- manifestations_evidenced: copy EXACT catalog strings from the component's "Expected manifestations" list in the prompt — do not paraphrase or shorten.\n` +
  `- INFORMATION EFFECTIVENESS (information_communication component): Distinguish between information presence and information effectiveness. Clarity of delivery is not the same as fitness for purpose.\n` +
  `  Ask: could people actually follow the guidance given their real constraints? Did it cover the scenario they faced?\n` +
  `  A component may show: clear wide-distribution of shelter guidance (presence) alongside complete absence of guidance on economic decisions or mass-casualty scenarios (effectiveness gap).\n` +
  `  Name this split explicitly. E.g.: "Shelter instructions reached residents through multiple channels — but no guidance was issued for workers without legal protection to stop, and mass-casualty scenarios were not addressed in official messaging."\n` +
  `  Use information_actionable_effective signals to evidence the presence-effectiveness link; use information_effectiveness_gap signals to evidence the gap.\n` +
  `- BASELINE VS ELEVATED SERVICE FUNCTIONING: Baseline service operation (ambulance responded, hospital treated) is neutral, not positive evidence. Only cite service functioning as strong when it demonstrably performed despite disruption or elevated demand.\n` +
  `- DELTA + CONTESTED EVIDENCE TAGS: When a component's pre-computed line shows "SIGNIFICANT" or "SIGNIFICANT_vs_baseline", include a brief trend phrase ("a notable shift vs the 14-day baseline"). When it shows "contested", note that the evidence is split between supporting and opposing observations rather than collapsing to a single verdict. Do not invent direction or magnitude beyond what the instrument tags say.\n` +
  `- THIN EVIDENCE / ABSTENTION: When instrument tags include thin_evidence_floor, limited_evidence_neutral, or unverified_alert, do NOT use stability language ("calm", "stable", "normal"). For unverified_alert, lead with "a single unverified report suggests…" and recommend corroboration. For critical_single_signal, lead with "one verified high-stakes report indicates…", state corroboration is still limited, and do NOT treat the situation as stable. For critical_presence_gate, lead with "verified evidence of a critical failure mode is present…", name the signal type if known, do NOT balance with positive news, and do NOT use stability language.\n` +
  `- SUPPRESSION / DATA QUALITY (when SUPPRESSION_TRACE present on component line):\n` +
  `  Step 0 — fill data_quality_caveat FIRST (1–2 sentences, methodological only; NOT behavioral claims).\n` +
  `  Required: name the concrete limiter from trace tokens (source_cap_effect, thin_evidence_floor, SOURCE_CAP_BINDING, dominant_outlet from Data quality context).\n` +
  `  FORBIDDEN: inventing hidden/subconscious negative states ("hidden anxiety", "suppressed pessimism", "beneath the surface", "latent fear") to explain why headline score differs from signal tone.\n` +
  `  When data-quality framing conflicts with behavioral narrative, data-quality wins — do NOT resolve the gap with psych speculation.\n` +
  `  Then write behavioral narrative from evidence only; it must not contradict the caveat.\n` +
  `- TEXT-INFERRED GEO: When Geo audit tags show geo:provenance=text_inferred or metricsEligible=false, treat the signal as geographic context only — do NOT describe it as on-the-ground behavioral evidence at that locality.\n` +
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

function buildSocialQuarantineContext(socialQuarantine) {
  if (!socialQuarantine?.suggested && !socialQuarantine?.active) return '';
  if (socialQuarantine.active === true) {
    return (
      `━━━ SOCIAL CHANNEL QUARANTINE (ACTIVE) ━━━\n` +
      `Analyst confirmed exclusion of social OSINT from component metrics for this assessment.\n` +
      `Headline scores exclude source_type=social; social signals may still appear in evidence for context.\n` +
      `Note this methodological limit in evidence_quality_note or data_quality_caveat where relevant.\n\n`
    );
  }
  return (
    `━━━ SOCIAL CHANNEL QUARANTINE (SUGGESTED) ━━━\n` +
    `Social OSINT shows high polarization (pol≈${socialQuarantine.social_polarization ?? 'n/a'}, n=${socialQuarantine.social_signal_count ?? 0}).\n` +
    `Scores still include social until analyst review; add a brief data_quality caveat that social-channel evidence is contested and under review.\n\n`
  );
}

function buildScopeContext(reportScope) {
  const id = reportScope?.id;
  if (!id || id === 'national') return '';
  const label = reportScope?.label ?? id;
  return (
    `━━━ REPORT SCOPE: ${String(label).toUpperCase()} ━━━\n` +
    `Write this assessment as a regional report scoped to ${label}. ` +
    `Use national context only when comparison is analytically valid. ` +
    `Be explicit when evidence is from a sub-region and avoid generalizing beyond the scoped geography.\n\n`
  );
}

function formatClaimsBlockForPrompt(claimsByComponent) {
  if (!claimsByComponent || Object.keys(claimsByComponent).length === 0) return '';
  const lines = ['━━━ PRE-FILLED NARRATIVE_CLAIMS (preserve refs; rewrite prose only) ━━━'];
  for (const def of RESILIENCE_COMPONENTS) {
    const claims = claimsByComponent[def.id] ?? [];
    if (claims.length === 0) continue;
    lines.push(`**${def.id}**:`);
    for (const c of claims) {
      lines.push(`  - "${c.text}" refs=[${(c.signal_refs ?? []).join(', ')}] relation=${c.relation ?? 'parallel'}`);
    }
  }
  lines.push('Sonnet: you may adjust claim text for prose quality but MUST NOT add signal_refs or merge unrelated claims.\n');
  return `${lines.join('\n')}\n\n`;
}

function buildNarrativeUserMessage(date, totalArticles, feedback = '') {
  const steps =
    `Assessment anchor date: ${date}\nTotal articles counted for coverage: ${totalArticles}\n\n` +
    `Follow this order:\n` +
    `0. When a component has SUPPRESSION_TRACE, fill data_quality_caveat first (methodological limits; name source cap/floor/dominant outlet).\n` +
    `1. Fill evidence[] for each component (≥70% token overlap with Evidence lines; cite [S#] refs).\n` +
    `2. Fill or preserve narrative_claims (≥1 signal_ref each; use correct relation tag).\n` +
    `3. Write narrative prose from claims/evidence only; delete any sentence without support; no psych speculation when suppression applies.\n` +
    `4. Write cross_component_synthesis: Para 1 = bullet list (- component_id: "snippet" ([S#])); Para 2 = explicit non-claims ("No shared evidence links …"). Max 8 distinct URLs.\n`;
  if (feedback) {
    return `${steps}\n━━━ FIX THESE ISSUES FROM PRIOR ATTEMPT ━━━\n${feedback}\n`;
  }
  return steps;
}

function mergeNarrativeClaims(narratives, claimsByComponent) {
  if (!claimsByComponent) return narratives;
  const out = { ...narratives, components: [...(narratives.components ?? [])] };
  for (const def of RESILIENCE_COMPONENTS) {
    const haikuClaims = claimsByComponent[def.id];
    if (!haikuClaims?.length) continue;
    let comp = out.components.find((c) => c.component_id === def.id);
    if (!comp) {
      comp = { component_id: def.id };
      out.components.push(comp);
    }
    if (!comp.narrative_claims?.length) {
      comp.narrative_claims = haikuClaims;
    }
  }
  return out;
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
  socialQuarantineContext,
  contentKind,
  sourceTypes,
  macroSignals,
  registry,
  coOccurrenceBlock,
  claimsByComponent,
  retrievedSpansBlock,
}) {
  const scoreIntro = includeScoresInPrompt
    ? `The component SCORES are already computed — do not re-score. Your job is to write clear, behavioral narratives.\n\n`
    : `Component instrument tags (certainty, direction, sufficiency) are pre-computed — do not invent numeric 1–10 ratings. Your job is to write clear, behavioral narratives grounded in Evidence lines.\n\n`;
  const componentsBlock = formatScoredComponentsForNarrative(scoredComponents, totalArticles, {
    includeScores: includeScoresInPrompt,
    registry,
  });
  const metricsLabel = includeScoresInPrompt ? 'scores' : 'instrument tags';
  const claimsBlock = formatClaimsBlockForPrompt(claimsByComponent);
  const coOccurrence = coOccurrenceBlock ?? '';

  return (
    `You are a community resilience analyst writing behavioral narratives for a structured report.\n` +
    scoreIntro +
    scopeContext +
    dataVoidContext +
    (socialQuarantineContext ?? '') +
    formatMacroSignalsContext(macroSignals) +
    (contentKind === 'audio' ? AUDIO_NARRATIVE_CONTEXT : '') +
    (sourceTypes.has('field') ? FIELD_REPORT_NARRATIVE_CONTEXT : '') +
    (sourceTypes.has('naftali') ? NAFTALI_NARRATIVE_CONTEXT : '') +
    (priorContext || '') +
    (comparisonContext || '') +
    buildGroundingContext(date) +
    coOccurrence +
    NARRATIVE_ANTI_RELATIONSHIP_BLOCK +
    NARRATIVE_RULES_BLOCK +
    (retrievedSpansBlock || '') +
    claimsBlock +
    `━━━ THE 8 COMPONENTS (with pre-computed ${metricsLabel} and signals) ━━━\n\n` +
    `${componentsBlock}\n\n` +
    `━━━ OUTPUT FORMAT ━━━\n` +
    `Return ONLY valid JSON:\n` +
    `{\n` +
    `  "cross_component_synthesis": "<Para 1: bullet list (- component_id: \\"snippet\\" ([S#])). Para 2: explicit non-claims (No shared evidence links …). Max 8 distinct URLs; every line cites [S#] or URL. Only facts from Evidence lines.>",\n` +
    `  "evidence_quality_note": "<1 sentence on signal quality today: proportion of direct quotes vs reported facts>",\n` +
    `  "components": [\n` +
    `    {\n` +
    `      "component_id": "<id>",\n` +
    `      "manifestations_evidenced": ["<manifestation string>", ...],\n` +
    `      "manifestations_absent": ["<manifestation string> (informative absence | likely reporting gap)", ...],\n` +
    `      "evidence": ["<behavioral evidence items, each with ([source](URL)) if URL available; cite [S#]>", ...],\n` +
    `      "narrative_claims": [\n` +
    `        { "text": "<atomic claim>", "signal_refs": ["type@url:…"], "relation": "parallel|same_article_only|none" }\n` +
    `      ],\n` +
    `      "data_quality_caveat": "<1–2 sentences on score/data limits; REQUIRED when SUPPRESSION_TRACE present; methodological only>",\n` +
    `      "narrative": "<3–5 sentence behavioral narrative derived from narrative_claims and evidence only>"\n` +
    `    }, ...\n` +
    `  ]\n` +
    `}`
  );
}


function buildAssessmentComponent(def, scored, narr, groundingMeta) {
  const compGrounding = groundingMeta?.byComponent?.[def.id] ?? {};
  const interpretive = compGrounding.interpretive_summary === true
    || narr.interpretive_summary === true;
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
    floor_bypassed: scored.floor_bypassed === true,
    salience_critical: scored.salience_critical === true,
    salience_bypass_reasons: scored.salience_bypass_reasons ?? [],
    salience_dominant_signal_type: scored.salience_dominant_signal_type ?? null,
    presence_gate_triggered: scored.presence_gate_triggered === true,
    presence_gate: scored.presence_gate ?? null,
    operator_status: scored.operator_status ?? null,
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
    score_calibrated: scored.score_calibrated ?? null,
    calibration_trust: scored.calibration_trust ?? null,
    calibration_deficit: scored.calibration_deficit ?? null,
    weight_sensitivity: scored.weight_sensitivity ?? null,
    weight_sensitivity_note: scored.weight_sensitivity_note ?? null,
    facets: scored.facets ?? null,
    top_contributors: topContributorsFromScored(scored, def.id),
    manifestations_evidenced: narr.manifestations_evidenced ?? [],
    manifestations_absent: narr.manifestations_absent ?? [],
    evidence: narr.evidence ?? [],
    narrative_claims: narr.narrative_claims ?? [],
    data_quality_caveat: narr.data_quality_caveat ?? '',
    narrative: narr.narrative ?? '',
    narrative_grounding_score: compGrounding.score ?? narr.narrative_grounding_score ?? null,
    grounding_issues: compGrounding.issues ?? narr.grounding_issues ?? [],
    interpretive_summary: interpretive,
  };
}

function buildAssessmentPayload(narratives, scoredComponents, meta, groundingSummary = null) {
  const componentMap = Object.fromEntries(
    (narratives.components ?? []).map((c) => [c.component_id, c]),
  );
  const components = RESILIENCE_COMPONENTS.map((def) => {
    const scored = scoredComponents[def.id] ?? {};
    const narr = componentMap[def.id] ?? {};
    return buildAssessmentComponent(def, scored, narr, groundingSummary);
  });

  const payload = {
    date: meta.date,
    ...(meta.reportScope ? { report_scope: meta.reportScope } : {}),
    total_articles_analyzed: meta.totalArticles,
    overall_resilience_score: overallScore(scoredComponents),
    overall_score_calibrated: overallScore(
      Object.fromEntries(
        Object.entries(scoredComponents).map(([id, c]) => [id, {
          score: c.score_calibrated,
          certainty: c.certainty ?? 0,
        }]),
      ),
    ),
    content_kind: meta.contentKind,
    cross_component_synthesis: narratives.cross_component_synthesis ?? '',
    evidence_quality_note: narratives.evidence_quality_note ?? '',
    ...(groundingSummary?.summary ? { narrative_grounding_summary: groundingSummary.summary } : {}),
    norris_capacities: computeNorrisCapacities(scoredComponents, scoredComponents),
    components,
    ...(meta.macroSignals?.length ? { macro_signals: meta.macroSignals.slice(0, 50) } : {}),
    ...(meta.dataVoid ? { data_void: meta.dataVoid } : {}),
    ...(meta.oovCaptureCount > 0 ? { oov_capture_count: meta.oovCaptureCount } : {}),
    ...(meta.socialChannelQuarantine ? { social_channel_quarantine: meta.socialChannelQuarantine } : {}),
    ...(meta.quarantinedDigital?.count > 0 ? { quarantined_digital: meta.quarantinedDigital } : {}),
    ...(meta.allScopedSignals ? { scoped_signal_count: meta.allScopedSignals.length } : {}),
  };

  if (meta.pipelineDegrade?.active) {
    payload.narrative_pipeline_degraded = true;
    payload.narrative_pipeline_degrade_reasons = meta.pipelineDegrade.reasons;
  }

  return payload;
}

async function buildNarrativeGenerationContext(scoredComponents, date, totalArticles, opts) {
  const includeScoresInPrompt = narrativeIncludesScores();
  const priorContext = formatPriorReportsContext(opts.priorReports, { includeScores: includeScoresInPrompt });
  const comparisonContext = formatComparisonScoresContext(opts.comparisonLabel, opts.comparisonScores, {
    includeScores: includeScoresInPrompt,
    comparable: opts.comparisonComparable,
  });
  const registry = buildSignalRefRegistry(scoredComponents);
  const coOccurrenceBlock = isNarrativeGroundingEnabled()
    ? formatCoOccurrenceForPrompt(registry)
    : '';
  const { block: retrievedSpansBlock } = await buildNarrativeRetrievalContext(scoredComponents, {
    retrievalService: opts.retrievalService,
    reportDate: date,
  });
  let claimsByComponent = null;
  if (isNarrativeFactsPassEnabled()) {
    claimsByComponent = await extractNarrativeFacts(scoredComponents, {
      onUsage: opts.onUsage,
      retrievedSpansBlock,
    });
  }
  const systemPrompt = buildNarrativeSystemPrompt({
    includeScoresInPrompt,
    scoredComponents,
    totalArticles,
    date,
    priorContext,
    comparisonContext,
    scopeContext: buildScopeContext(opts.reportScope),
    dataVoidContext: buildDataVoidContext(opts.dataVoid),
    socialQuarantineContext: buildSocialQuarantineContext(opts.socialChannelQuarantine),
    contentKind: opts.contentKind,
    sourceTypes: opts.sourceTypes,
    macroSignals: opts.macroSignals,
    registry,
    coOccurrenceBlock,
    claimsByComponent,
    retrievedSpansBlock,
  });
  const meta = {
    date,
    reportScope: opts.reportScope,
    totalArticles,
    contentKind: opts.contentKind,
    macroSignals: opts.macroSignals,
    dataVoid: opts.dataVoid,
    oovCaptureCount: opts.oovCaptureCount,
    socialChannelQuarantine: opts.socialChannelQuarantine,
    allScopedSignals: opts.allScopedSignals,
  };
  return { systemPrompt, meta, claimsByComponent, registry };
}

async function fetchNarrativeJson(systemPrompt, date, totalArticles, feedback, attempt, onUsage, claimsByComponent) {
  const label = attempt > 1 ? `[Step 2 — Narratives] (retry ${attempt})` : '[Step 2 — Narratives]';
  const userContent = buildNarrativeUserMessage(date, totalArticles, feedback);
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
  let narratives = extractJson(textBlock.text);
  return mergeNarrativeClaims(narratives, claimsByComponent);
}

function groundingExhaustedMessage(kind, maxRetries, pipelineDegrade) {
  console.error(`  ⚠ ${kind} failed after ${maxRetries} attempts — proceeding`);
  if (pipelineDegrade) {
    pipelineDegrade.active = true;
    pipelineDegrade.reasons.push(`${kind}: exhausted after ${maxRetries} attempts`);
  }
}

async function applyNarrativeGroundingChecks(
  narratives, scoredComponents, registry, attempt, maxRetries, onUsage, pipelineDegrade,
) {
  let feedback = '';
  const validation = validateNarrativeOutput(narratives, { scoredComponents, registry });
  if (!validation.ok) {
    feedback = formatValidationFeedback(validation);
    if (attempt < maxRetries) throw new Error(`Validation failed: ${validation.errors.join('; ')}`);
    groundingExhaustedMessage('Narrative validation', maxRetries, pipelineDegrade);
  }
  const suppressResult = validateSuppressionCompliance(narratives, scoredComponents);
  if (!suppressResult.ok) {
    const suppressFeedback = formatSuppressionFeedback(suppressResult);
    feedback = feedback ? `${feedback}\n\n${suppressFeedback}` : suppressFeedback;
    if (attempt < maxRetries) throw new Error(`Suppression compliance failed: ${suppressResult.errors.join('; ')}`);
    groundingExhaustedMessage('Suppression compliance', maxRetries, pipelineDegrade);
  }
  if (isNarrativeJudgeEnabled()) {
    const judgeResult = await judgeNarrativeRelations(narratives, registry, { onUsage });
    if (!judgeResult.ok) {
      feedback = formatJudgeFeedback(judgeResult.failures);
      if (attempt < maxRetries) {
        throw new Error(`Judge rejected: ${judgeResult.failures.length} invented relation(s)`);
      }
      groundingExhaustedMessage('Relation judge', maxRetries, pipelineDegrade);
    }
  }
  return feedback;
}

function mergeGroundingIntoNarratives(narratives, grounding) {
  for (const def of RESILIENCE_COMPONENTS) {
    const comp = (narratives.components ?? []).find((c) => c.component_id === def.id);
    if (!comp) continue;
    const g = grounding.byComponent[def.id];
    if (g) {
      comp.narrative_grounding_score = g.score;
      comp.grounding_issues = g.issues;
      comp.interpretive_summary = g.interpretive_summary;
    }
  }
}

async function processNarrativeAttempt(ctx, attempt, maxRetries) {
  const { systemPrompt, meta, claimsByComponent, registry, scoredComponents, date, totalArticles, onUsage, pipelineDegrade } = ctx;
  let narratives = await fetchNarrativeJson(
    systemPrompt, date, totalArticles, ctx.feedback, attempt, onUsage, claimsByComponent,
  );
  if (!isNarrativeGroundingEnabled()) {
    return buildAssessmentPayload(narratives, scoredComponents, meta);
  }
  ctx.feedback = await applyNarrativeGroundingChecks(
    narratives, scoredComponents, registry, attempt, maxRetries, onUsage, pipelineDegrade,
  );
  const grounding = computeGroundingScores(narratives, scoredComponents, registry);
  if (onUsage) {
    onUsage({
      label: '[Step 2 — Grounding]',
      model: 'deterministic',
      usage: { input_tokens: 0, output_tokens: 0 },
    });
  }
  if (
    isNarrativeGroundingBlockEnabled()
    && attempt >= maxRetries
    && grounding.summary?.mean_score < narrativeGroundingMinScore()
  ) {
    throw new Error(
      `Narrative grounding below threshold (${grounding.summary.mean_score} < ${narrativeGroundingMinScore()})`,
    );
  }
  mergeGroundingIntoNarratives(narratives, grounding);
  return buildAssessmentPayload(narratives, scoredComponents, meta, grounding);
}

export async function generateNarrativesLegacy(
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
    comparisonComparable = true,
    macroSignals = [],
    allScopedSignals = null,
    dataVoid = null,
    oovCaptureCount = 0,
    socialChannelQuarantine = null,
    retrievalService = null,
  } = {},
) {
  const setup = await buildNarrativeGenerationContext(scoredComponents, date, totalArticles, {
    onUsage,
    priorReports,
    contentKind,
    sourceTypes,
    reportScope,
    comparisonScores,
    comparisonLabel,
    comparisonComparable,
    macroSignals,
    allScopedSignals,
    dataVoid,
    oovCaptureCount,
    socialChannelQuarantine,
    retrievalService,
  });

  const MAX_RETRIES = 3;
  const pipelineDegrade = { active: false, reasons: [] };
  const ctx = {
    ...setup,
    scoredComponents,
    date,
    totalArticles,
    onUsage,
    feedback: '',
    pipelineDegrade,
  };
  setup.meta.pipelineDegrade = pipelineDegrade;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await processNarrativeAttempt(ctx, attempt, MAX_RETRIES);
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      if (!ctx.feedback) ctx.feedback = err.message;
      console.error(`  ⚠ Step 2 attempt ${attempt} failed (${err.message}) — retrying in ${5 * attempt}s...`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

export async function generateNarratives(
  scoredComponents,
  allSignals,
  date,
  totalArticles,
  opts = {},
) {
  const { closedCoreNarrate } = await import('../app/closedCoreNarrate.js');
  return closedCoreNarrate(scoredComponents, allSignals, date, totalArticles, opts);
}

// Backwards-compat: synthesizeComponents wraps score + narrate
export async function synthesizeComponents(signals, date, totalArticles, {
  onUsage,
  onProgress,
  contentKind,
  dataVoid = null,
  salienceContext = null,
} = {}) {
  const scored = scoreComponents(signals, {
    totalArticles,
    salienceContext: salienceContext ?? salienceContextFromDataVoid(dataVoid),
  });
  return generateNarratives(scored, signals, date, totalArticles, {
    onUsage,
    onProgress,
    contentKind,
    dataVoid,
    narrativeScopeSignals: signals,
  });
}

export { buildAssessmentPayload };