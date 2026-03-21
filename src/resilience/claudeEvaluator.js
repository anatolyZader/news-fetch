/**
 * Two-step LLM evaluation using Claude API:
 *   Step 0 — Title pre-filter: Haiku quickly discards irrelevant articles.
 *   Step 1 — Signal extraction: Haiku extracts typed behavioral signals (closed vocabulary).
 *             Code deterministically maps signals → component scores (no LLM scoring).
 *   Step 2 — Narrative generation: Opus writes component narratives based on the signals.
 *             Opus does NOT score — scoring is handled by scoreComponents() in behaviorSignals.js.
 */

import Anthropic from '@anthropic-ai/sdk';
import { RESILIENCE_COMPONENTS } from './resilienceComponents.js';
import { SIGNAL_CATALOG, SIGNAL_TYPES, summarizeConfidence } from './behaviorSignals.js';

const client = new Anthropic(); // uses ANTHROPIC_API_KEY from env

// ─── Component formatters ─────────────────────────────────────────────────────

function formatComponentsForPrompt() {
  return RESILIENCE_COMPONENTS.map((c) => {
    let text =
      `**${c.id}** — ${c.name_en}\n` +
      `Description: ${c.description}`;
    if (c.principle) {
      text += `\nPrinciple: ${c.principle}`;
    }
    if (c.behavioral_manifestations?.length) {
      text += `\nBehavioral manifestations:\n` +
        c.behavioral_manifestations.map((m, i) => `  ${i + 1}. ${m}`).join('\n');
    }
    return text;
  }).join('\n\n');
}

// ─── Signal catalog formatter ─────────────────────────────────────────────────

function formatSignalCatalog() {
  const byDomain = {};
  for (const s of SIGNAL_CATALOG) {
    if (!byDomain[s.domain]) byDomain[s.domain] = [];
    byDomain[s.domain].push(s);
  }
  return Object.entries(byDomain).map(([domain, signals]) => {
    const lines = signals.map((s) => `  - \`${s.type}\`: ${s.label}`);
    return `**${domain}**\n${lines.join('\n')}`;
  }).join('\n\n');
}

// ─── JSON extraction helpers ──────────────────────────────────────────────────

function extractJsonArray(text) {
  try {
    return extractJson(text);
  } catch {
    const objects = [];
    const re = /\{[\s\S]+?\}(?=\s*[,\]]|\s*$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      try { objects.push(JSON.parse(m[0])); } catch { /* skip */ }
    }
    if (objects.length > 0) {
      console.error(`  ⚠ Recovered ${objects.length} partial signal objects`);
      return objects;
    }
    throw new Error('Could not recover any valid JSON objects from Step 1 response');
  }
}

function extractJson(text) {
  const fenced = text.match(/^```(?:json)?\s*\n([\s\S]+?)\n```\s*$/m);
  if (fenced) return JSON.parse(fenced[1].trim());

  const arrIdx = text.indexOf('[');
  const objIdx = text.indexOf('{');
  const start =
    arrIdx === -1 ? objIdx
    : objIdx === -1 ? arrIdx
    : Math.min(arrIdx, objIdx);

  if (start !== -1) {
    const lastArr = text.lastIndexOf(']');
    const lastObj = text.lastIndexOf('}');
    const end = Math.max(lastArr, lastObj);
    if (end > start) return JSON.parse(text.slice(start, end + 1));
  }

  return JSON.parse(text.trim());
}

// ─── Progress indicator ───────────────────────────────────────────────────────

async function streamWithProgress(stream, label) {
  process.stderr.write(`${label} `);
  let dots = 0;
  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta' &&
      ++dots % 200 === 0
    ) {
      process.stderr.write('.');
    }
  }
  process.stderr.write(' done\n');
}

// ─── Step 1: Signal extraction ────────────────────────────────────────────────

const EVIDENCE_BATCH_SIZE = 60;
// Haiku rate limit is 50K input tokens/min. Each batch uses ~9.5K input tokens (9.5/50 × 60 = 11.4s).
// 20s gives a safe margin; the old 75s was calibrated for a now-removed pre-filter burst.
const BATCH_DELAY_MS = 20_000;

// Behavioral signal keywords — used to score paragraph relevance
const BEHAVIORAL_KEYWORDS = [
  // Hebrew
  'מקלט', 'פינוי', 'חרדה', 'פחד', 'התנדבות', 'קהילה', 'סגירה', 'פתיחה', 'נפגע',
  'טיפול', 'חולה', 'נפש', 'חוסן', 'תמיכה', 'עזרה', 'מנהיגות', 'ראש עיר', 'עיריה',
  'תושב', 'אמר', 'סיפר', 'מספרת', 'מספר', 'ציין', 'הוסיף', 'הדגיש', 'ילד', 'קשיש',
  'נכה', 'מפונה', 'שינה', 'לא ישן', 'פגיעה', 'ממ"ד', 'אזעקה', 'בית ספר', 'גן',
  // English
  'shelter', 'evacuee', 'evacuation', 'anxiety', 'fear', 'volunteer', 'community',
  'closure', 'injured', 'trauma', 'mental', 'resilience', 'support', 'mayor', 'municipality',
  'resident', 'said', 'told', 'described', 'children', 'elderly', 'disabled', 'sleep',
  'school', 'kindergarten', 'siren', 'alert', 'damage', 'wounded',
];

/**
 * Score a paragraph by how many behavioral keywords it contains.
 */
function scoreParagraph(text) {
  const lower = text.toLowerCase();
  return BEHAVIORAL_KEYWORDS.reduce((n, kw) => n + (lower.includes(kw) ? 1 : 0), 0);
}

/**
 * Return the top-k most behaviorally relevant paragraphs from a body, preserving order.
 * Falls back to first paragraph if none score above zero.
 */
function extractTopKParagraphsByRelevance(body, k = 3) {
  if (!body) return '';
  const paragraphs = body.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  if (paragraphs.length <= k) return paragraphs.join('\n\n');

  const scored = paragraphs.map((p, idx) => ({ p, idx, score: scoreParagraph(p) }));
  const topK = scored
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, k)
    .sort((a, b) => a.idx - b.idx); // restore original order

  if (topK.length === 0) return paragraphs[0]; // fallback: lead paragraph
  return topK.map((x) => x.p).join('\n\n');
}

function formatArticlesForPrompt(articles) {
  return articles
    .map(
      (a, i) =>
        `### [${i + 1}] ${a.title}\n` +
        `Source: ${a.source} | Published: ${a.publishedAt}\n` +
        `URL: ${a.url || '(no url)'}\n\n` +
        (extractTopKParagraphsByRelevance(a.body, 6) || '(no body text)'),
    )
    .join('\n\n---\n\n');
}

const SIGNAL_EXTRACTION_SYSTEM_PROMPT =
  `You are a behavioral signal extractor for community resilience analysis in Israel.\n` +
  `Extract atomic behavioral signals from news articles using a closed vocabulary of signal types.\n\n` +

  `━━━ EVIDENCE TYPE ━━━\n` +
  `Every signal must be assigned one of these four evidence_type values (closed vocabulary).\n` +
  `Choose the most specific type that applies. This determines scoring weight — be accurate.\n\n` +

  `"direct_quote_named_person"   — a named individual is quoted directly. You can answer WHO said this.\n` +
  `  ACCEPT: 'A resident of Kiryat Shmona said: "I haven't slept in three nights"'\n` +
  `  ACCEPT: named official/role with a direct quote or attributed action\n` +
  `  REJECT: paraphrase, journalist summary, vague attribution ("residents say")\n` +
  `  ⚠ Emotional/narrative signals (fear_expression, calm_confidence, resilience_narrative_*): this type ONLY\n\n` +

  `"named_survey_statistic"      — a named study, survey, or institution reports a measured finding.\n` +
  `  ACCEPT: 'Bar-Ilan survey: 68% of northern residents report sleep disruption'\n` +
  `  ACCEPT: 'Magen David Adom: 790 people injured reaching shelters'\n` +
  `  REJECT: journalist estimates, vague statistics without a named source\n\n` +

  `"named_institutional_fact"    — a named institution takes a concrete, datable action.\n` +
  `  ACCEPT: municipality announced schools closed through Thursday\n` +
  `  ACCEPT: hospital operating at emergency capacity from Sunday\n` +
  `  REJECT: general descriptions of institutional state without a specific action\n\n` +

  `"observational_reported_fact" — a verifiable structural condition or observable behavioral pattern\n` +
  `  reported as fact, without a named speaker, grounded in a specific, dateable event.\n` +
  `  ACCEPT: evacuation of a named community; shelter infrastructure absent in a named location\n` +
  `  ACCEPT: school/clinic/business closed or opened in a named location\n` +
  `  REJECT: journalist assessments of mood, atmosphere, or spirit without concrete facts\n` +
  `  REJECT: "many residents feel..." / inferred emotion (missile struck → therefore people are scared)\n\n` +

  `━━━ EXTRACTION RULES (apply to both classes) ━━━\n` +
  `1. ATOMIC: Each signal is one single behavioral fact — one verb, one meaning. Split compound behaviors.\n` +
  `2. CLOSED VOCABULARY: You MUST choose signal type from the list below. Never invent new types.\n` +
  `3. DO NOT EXTRACT: political/military/diplomatic content — unless it contains a direct civilian behavioral response.\n` +
  `4. DO NOT EXTRACT: global indices, international rankings, or pre-crisis baseline surveys.\n\n` +

  `━━━ CLASSIFICATION BOUNDARIES (read before choosing signal type) ━━━\n` +
  `- Education operating remotely / schools closed → service_disruption or service_continuity (functional_continuity domain), NOT information_*\n` +
  `- Businesses closed, clinics not operating, transport cancelled → service_disruption (functional_continuity domain)\n` +
  `- information_* types are ONLY for: residents receiving/missing/seeking safety or operational guidance, rumor spread, contradictory official messages\n\n` +

  `━━━ SIGNAL TYPES (closed vocabulary) ━━━\n` +
  `${formatSignalCatalog()}\n\n` +

  `━━━ SCOPE LEVEL (choose one — rates evidence breadth, not emotional vividness) ━━━\n` +
  `"single_case"          — a single behavioral instance or quote from one actor\n` +
  `"repeated_pattern"     — more than one instance, or article explicitly describes recurrence or a pattern\n` +
  `"quantified_or_broad"  — a count, percentage, named survey result, or institutional action with system-wide scope\n\n` +

  `━━━ OUTPUT SCHEMA ━━━\n` +
  `For each behavioral signal found, output a JSON object:\n` +
  `{\n` +
  `  "article_index": <N from [N]>,\n` +
  `  "article_url": "<URL from the article header, or null>",\n` +
  `  "signal_type": "<one type from the closed vocabulary above>",\n` +
  `  "evidence_type": "direct_quote_named_person" | "named_survey_statistic" | "named_institutional_fact" | "observational_reported_fact",\n` +
  `  "evidence": "<exact quote or bare factual description — no journalist adjectives, max 300 chars>",\n` +
  `  "scope_level": "single_case" | "repeated_pattern" | "quantified_or_broad"\n` +
  `}\n\n` +
  `Return ONLY a valid JSON array. One article can yield multiple signals. Skip articles with no extractable behavioral evidence.`;

async function extractSignalsBatch(articles, batchLabel, retries = 3, usageCallback = null) {
  const userContent =
    `Extract all behavioral signals from these Israeli news articles:\n\n` +
    formatArticlesForPrompt(articles);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const stream = client.messages.stream({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 12000,
        temperature: 0,
        system: SIGNAL_EXTRACTION_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });

      const label = attempt > 1 ? `${batchLabel} (retry ${attempt})` : batchLabel;
      await streamWithProgress(stream, label);

      const message = await stream.finalMessage();
      if (message.stop_reason === 'max_tokens') {
        console.error('  ⚠ batch hit max_tokens — attempting partial recovery');
      }
      console.error(`  → stop_reason: ${message.stop_reason}`);
      if (usageCallback) usageCallback({ label: batchLabel, model: 'claude-haiku-4-5-20251001', usage: message.usage });

      const textBlock = message.content.find((b) => b.type === 'text');
      if (!textBlock) throw new Error(`${batchLabel}: no text block`);

      const signals = extractJsonArray(textBlock.text);
      if (!Array.isArray(signals)) throw new Error(`${batchLabel}: expected JSON array`);

      // Validate signal types and evidence_type values
      const validTypes = new Set(SIGNAL_TYPES);
      const validEvidenceTypes = new Set([
        'direct_quote_named_person', 'named_survey_statistic',
        'named_institutional_fact', 'observational_reported_fact',
      ]);
      const EMOTIONAL_SIGNAL_TYPES = new Set([
        'fear_expression', 'calm_confidence',
        'resilience_narrative_positive', 'resilience_narrative_negative',
      ]);
      const valid = signals.filter((s) => {
        if (!validTypes.has(s.signal_type)) {
          console.error(`  ⚠ Dropped unknown signal type: "${s.signal_type}"`);
          return false;
        }
        // Normalize unknown evidence_type to observational fallback
        if (!validEvidenceTypes.has(s.evidence_type)) {
          s.evidence_type = 'observational_reported_fact';
        }
        // Emotional signals require named person evidence
        if (EMOTIONAL_SIGNAL_TYPES.has(s.signal_type) &&
            s.evidence_type === 'observational_reported_fact') {
          console.error(`  ⚠ Dropped emotional signal without named-person evidence: "${s.signal_type}"`);
          return false;
        }
        return true;
      });

      // Enrich signals with source label for diversity tracking in scoreComponents
      for (const s of valid) {
        const art = articles[s.article_index - 1];
        if (art) s.article_source = art.source;
      }

      return valid;
    } catch (err) {
      if (attempt === retries) throw err;
      const is429 = err.message?.includes('429') || err.status === 429;
      const wait = is429 ? 90000 : 5000 * attempt;
      console.error(`  ⚠ ${batchLabel} attempt ${attempt} failed (${err.message}) — retrying in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

/**
 * Step 1: Extract behavioral signals from articles.
 * Signals use a closed vocabulary; their mapping to components is done by code in behaviorSignals.js.
 *
 * @param {Array} articles   Flat array from loadMdFiles()
 * @returns {Array}          Signal objects: { article_index, article_url, signal_type, evidence_class, scope_level, confidence, evidence }
 */
export async function extractSignals(articles, { onUsage, onProgress } = {}) {
  if (articles.length <= EVIDENCE_BATCH_SIZE) {
    onProgress?.({ type: 'progress', step: 'extract', message: 'Extracting behavioral signals...' });
    return extractSignalsBatch(articles, '[Step 1 — Signal extraction]', 3, onUsage);
  }

  const batches = [];
  for (let i = 0; i < articles.length; i += EVIDENCE_BATCH_SIZE) {
    batches.push(articles.slice(i, i + EVIDENCE_BATCH_SIZE));
  }

  console.error(`  → splitting ${articles.length} articles into ${batches.length} batches of ≤${EVIDENCE_BATCH_SIZE}`);
  let allSignals = [];
  for (let i = 0; i < batches.length; i++) {
    if (i > 0) {
      console.error(`  → waiting ${BATCH_DELAY_MS / 1000}s between batches...`);
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
    onProgress?.({ type: 'progress', step: 'extract', message: `Extracting signals (batch ${i + 1}/${batches.length})...` });
    const label = `[Step 1 — batch ${i + 1}/${batches.length}]`;
    const signals = await extractSignalsBatch(batches[i], label, 3, onUsage);
    console.error(`  → ${signals.length} signals from batch ${i + 1}`);
    allSignals = allSignals.concat(signals);
  }
  return allSignals;
}

// Backwards-compat alias
export { extractSignals as extractEvidence };

// ─── Step 2: Narrative generation ─────────────────────────────────────────────

/**
 * Format the pre-scored component data + its signals for the narrative prompt.
 */
function formatScoredComponentsForNarrative(scoredComponents, signalCatalogMap, totalArticles) {
  return RESILIENCE_COMPONENTS.map((compDef) => {
    const scored = scoredComponents[compDef.id];
    const conf = summarizeConfidence(scored?.confidence);
    const signals = (scored?.signals ?? []).map((s) => {
      return `  [${s.signal_type}] (scope:${s.scope_level ?? 'single_case'}, confidence:${s.confidence})\n  Evidence: "${s.evidence}"${s.article_url ? `\n  URL: ${s.article_url}` : ''}`;
    }).join('\n');

    const scoresSummary = scored?.score != null
      ? `Score: ${scored.score}/10  Certainty: ${(scored.certainty * 100).toFixed(0)}%  Direction: ${scored.strength >= 0 ? '+' : ''}${scored.strength.toFixed(2)}  (${scored.distinct_article_count}/${totalArticles} articles, ${(scored.coverage_ratio * 100).toFixed(1)}%, ${scored.dispersion} dispersion)  +ev:${scored.positive_evidence} −ev:${scored.negative_evidence}`
      : 'Score: insufficient data';

    return (
      `**${compDef.id}** — ${compDef.name_en}\n` +
      `Confidence: ${conf}  ${scoresSummary}\n` +
      `Behavioral manifestations:\n${compDef.behavioral_manifestations?.map((m, i) => `  ${i + 1}. ${m}`).join('\n') ?? '(none defined)'}\n` +
      `Signals extracted (${scored?.signal_count ?? 0}):\n${signals || '  (none)'}`
    );
  }).join('\n\n---\n\n');
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
function formatPriorReportsContext(priorReports) {
  if (!priorReports || priorReports.length === 0) return '';
  const sections = priorReports.map((r) => {
    const compScores = (r.components ?? [])
      .map((c) => `    ${c.component_id.padEnd(28)} ${c.score ?? 'N/A'}/10`)
      .join('\n');
    const synthesis = (r.cross_component_synthesis ?? '').slice(0, 600);
    return `[${r.date}] Overall: ${r.overall_resilience_score}/10\n${compScores}\n  Summary: ${synthesis}${synthesis.length === 600 ? '…' : ''}`;
  });
  return (
    `━━━ PRIOR DAYS' CONTEXT (for trend analysis) ━━━\n` +
    `Use this to identify directional trends: is each component improving, declining, or stable?\n` +
    `Reference trends in your narratives where meaningful. Do not repeat prior text verbatim.\n\n` +
    sections.join('\n\n') + '\n\n'
  );
}

export async function generateNarratives(scoredComponents, allSignals, date, totalArticles, { onUsage, onProgress, priorReports } = {}) {
  const signalCatalogMap = Object.fromEntries(SIGNAL_CATALOG.map((s) => [s.type, s]));

  const priorContext = formatPriorReportsContext(priorReports);

  const systemPrompt =
    `You are a community resilience analyst writing behavioral narratives for a structured report.\n` +
    `The component SCORES are already computed — do not re-score. Your job is to write clear, behavioral narratives.\n\n` +
    (priorContext ? priorContext : '') +

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
    `- SCOPE DISCIPLINE: Never use "the only", "the one exception", "uniquely", or similar exclusive claims.\n` +
    `  The articles are a sample, not a census. Something appearing once in the data means it was reported once — not that it is the sole instance.\n` +
    `- LINKS: Each signal has a URL. When a signal has a URL, embed a markdown link for every significant claim:\n` +
    `    In narrative: append ([source](URL)) after the relevant sentence\n` +
    `    In evidence items: append ([source](URL)) at end of the item\n` +
    `    If a signal has no URL, omit the link — do not fabricate URLs\n\n` +

    `━━━ THE 8 COMPONENTS (with pre-computed scores and signals) ━━━\n\n` +
    `${formatScoredComponentsForNarrative(scoredComponents, signalCatalogMap, totalArticles)}\n\n` +

    `━━━ OUTPUT FORMAT ━━━\n` +
    `Return ONLY valid JSON:\n` +
    `{\n` +
    `  "cross_component_synthesis": "<2 paragraphs — behavioral summary across all 8 components>",\n` +
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
    `}`;

  const userContent =
    `Date: ${date}\nTotal articles: ${totalArticles}\n\n` +
    `Write behavioral narratives for all 8 components based on the signals above.`;

  const MAX_RETRIES = 3;
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const label = attempt > 1 ? `[Step 2 — Narratives] (retry ${attempt})` : '[Step 2 — Narratives]';
      const stream = client.messages.stream({
        model: 'claude-sonnet-4-6',
        max_tokens: 16000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });

      await streamWithProgress(stream, label);
      const message = await stream.finalMessage();
      if (onUsage) onUsage({ label: '[Step 2 — Narratives]', model: 'claude-sonnet-4-6', usage: message.usage });

      const textBlock = message.content.find((b) => b.type === 'text');
      if (!textBlock) throw new Error('Step 2: no text block');

      const narratives = extractJson(textBlock.text);

      // Merge narratives into scored components to produce final assessment
      const componentMap = Object.fromEntries(
        (narratives.components ?? []).map((c) => [c.component_id, c])
      );

      const components = RESILIENCE_COMPONENTS.map((def) => {
        const scored = scoredComponents[def.id] ?? {};
        const narr = componentMap[def.id] ?? {};
        return {
          component_id: def.id,
          confidence: scored.confidence ?? 'insufficient_data',
          signal_count: scored.signal_count ?? 0,
          distinct_article_count: scored.distinct_article_count ?? 0,
          source_diversity: scored.source_diversity ?? 0,
          coverage_ratio: scored.coverage_ratio ?? 0,
          dispersion: scored.dispersion ?? null,
          coverage_adjustment: scored.coverage_adjustment ?? 0,
          positive_evidence: scored.positive_evidence ?? 0,
          negative_evidence: scored.negative_evidence ?? 0,
          net_evidence: scored.net_evidence ?? 0,
          evidence_mass: scored.evidence_mass ?? 0,
          strength: scored.strength ?? 0,
          adjusted_strength: scored.adjusted_strength ?? 0,
          certainty: scored.certainty ?? 0,
          manifestations_evidenced: narr.manifestations_evidenced ?? [],
          manifestations_absent: narr.manifestations_absent ?? [],
          evidence: narr.evidence ?? [],
          narrative: narr.narrative ?? '',
        };
      });

      return {
        date,
        total_articles_analyzed: totalArticles,
        cross_component_synthesis: narratives.cross_component_synthesis ?? '',
        evidence_quality_note: narratives.evidence_quality_note ?? '',
        components,
      };
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      console.error(`  ⚠ Step 2 attempt ${attempt} failed (${err.message}) — retrying in ${5 * attempt}s...`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

// Backwards-compat: synthesizeComponents wraps the new two-step (score + narrate)
// so that analysisService.js and test-token-usage.js continue to work.
import { scoreComponents, overallScore } from './behaviorSignals.js';

export async function synthesizeComponents(signals, date, totalArticles, { onUsage, onProgress } = {}) {
  const scored = scoreComponents(signals);
  return generateNarratives(scored, signals, date, totalArticles, { onUsage, onProgress });
}
