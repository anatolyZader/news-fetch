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
import { SIGNAL_CATALOG, SIGNAL_TYPES } from './behaviorSignals.js';

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

// Body sent to Haiku — first 400 chars capture the lead paragraph
const STEP1_BODY_CHARS = 400;

function formatArticlesForPrompt(articles) {
  return articles
    .map(
      (a, i) =>
        `### [${i + 1}] ${a.title}\n` +
        `Source: ${a.source} | Published: ${a.publishedAt}\n` +
        `URL: ${a.url || '(no url)'}\n\n` +
        (a.body?.slice(0, STEP1_BODY_CHARS) || '(no body text)'),
    )
    .join('\n\n---\n\n');
}

const SIGNAL_EXTRACTION_SYSTEM_PROMPT =
  `You are a behavioral signal extractor for community resilience analysis in Israel.\n` +
  `Extract atomic behavioral signals from news articles using a closed vocabulary of signal types.\n\n` +

  `━━━ EXTRACTION RULES ━━━\n` +
  `1. ATOMIC: Each signal is one single behavioral fact — one verb, one meaning. Split compound behaviors.\n` +
  `2. CLOSED VOCABULARY: You MUST choose signal type from the list below. Never invent new types.\n` +
  `3. EVIDENCE REQUIRED: Only extract when there is a concrete behavioral fact in the article:\n` +
  `   - A verbatim or near-verbatim quote from an identified person\n` +
  `   - A specific observable action or event (something that happened or was done)\n` +
  `   - A statistic, count, or percentage from a named source\n` +
  `4. SOURCE ATTRIBUTION IS MANDATORY — journalist voice is not evidence:\n` +
  `   You must be able to answer: WHO said this or WHO did this?\n` +
  `   REJECT — journalist describes population emotion:  "Residents are gripped by fear" / "The atmosphere is one of despair" / "Israelis showed remarkable resilience"\n` +
  `   REJECT — editorial framing as fact:                "The battered community struggles to cope" / "A nation under siege finds its spirit"\n` +
  `   REJECT — vague collective attribution:             "Many residents feel..." / "People are anxious..." (no named person or measured group)\n` +
  `   REJECT — inferred emotion from events:             Missile struck → therefore residents are scared (inference, not reported behavior)\n` +
  `   ACCEPT — named person or role quotes directly:     A resident of Kiryat Shmona said: "I haven't slept in three nights"\n` +
  `   ACCEPT — identified group with measured behavior:  790 people were injured reaching shelters in a single 24-hour period (Magen David Adom data)\n` +
  `   ACCEPT — institutional action with named actor:    The municipality announced schools will remain closed through Thursday\n` +
  `   ACCEPT — survey or study with named source:        A Bar-Ilan University survey found 68% of northern residents report sleep disruption\n` +
  `5. EMOTIONAL / NARRATIVE SIGNALS (fear_expression, calm_confidence, resilience_narrative_*) are especially prone to journalist contamination.\n` +
  `   Extract these ONLY from direct first-person quotes or named survey data. Never from journalist description, even vivid or specific-sounding.\n` +
  `6. DO NOT EXTRACT: political statements about the war, military operations, diplomatic developments, or national policy debates — unless they contain a direct, named behavioral response from the civilian population.\n` +
  `7. DO NOT EXTRACT: global indices, international rankings, or surveys conducted before the current emergency. These measure long-term or pre-crisis baselines, not current population behavior under emergency conditions.\n\n` +

  `━━━ CLASSIFICATION BOUNDARIES (read before choosing signal type) ━━━\n` +
  `- Education operating remotely / Zoom school / schools closed → service_disruption or service_continuity (functional_continuity domain), NOT information_*\n` +
  `- Businesses closed, clinics not operating, transport cancelled → service_disruption (functional_continuity domain)\n` +
  `- information_* types are ONLY for: residents receiving/missing/seeking safety or operational guidance, rumor spread, confusing/contradictory official messages\n\n` +

  `━━━ SIGNAL TYPES (closed vocabulary) ━━━\n` +
  `${formatSignalCatalog()}\n\n` +

  `━━━ OUTPUT SCHEMA ━━━\n` +
  `For each behavioral signal found, output a JSON object:\n` +
  `{\n` +
  `  "article_index": <N from [N]>,\n` +
  `  "article_url": "<URL from the article header, or null>",\n` +
  `  "signal_type": "<one type from the closed vocabulary above>",\n` +
  `  "evidence": "<exact quote or bare factual description — no journalist adjectives, max 300 chars>",\n` +
  `  "intensity": <0.0–1.0, how strong/clear this behavioral signal is>,\n` +
  `  "confidence": <0.0–1.0 — set LOW (≤0.4) if the evidence comes from journalist description rather than a named source; set HIGH (≥0.8) only for direct quotes or named data>\n` +
  `}\n\n` +
  `Return ONLY a valid JSON array. One article can yield multiple signals. Skip articles with no direct behavioral evidence.`;

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

      // Validate & normalize signal types
      const validTypes = new Set(SIGNAL_TYPES);
      const valid = signals.filter((s) => {
        if (!validTypes.has(s.signal_type)) {
          console.error(`  ⚠ Dropped unknown signal type: "${s.signal_type}"`);
          return false;
        }
        return true;
      });

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
 * @returns {Array}          Signal objects: { article_index, article_url, signal_type, evidence, intensity, confidence }
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
 * Format the pre-scored component data + its signals for the Opus narrative prompt.
 */
function formatScoredComponentsForNarrative(scoredComponents, signalCatalogMap) {
  return RESILIENCE_COMPONENTS.map((compDef) => {
    const scored = scoredComponents[compDef.id];
    const conf = scored?.confidence ?? 'insufficient_data';
    const signals = (scored?.signals ?? []).map((s) => {
      const cat = signalCatalogMap[s.signal_type];
      return `  [${s.signal_type}] (intensity:${s.intensity}, confidence:${s.confidence})\n  Evidence: "${s.evidence}"${s.article_url ? `\n  URL: ${s.article_url}` : ''}`;
    }).join('\n');

    return (
      `**${compDef.id}** — ${compDef.name_en}\n` +
      `Confidence: ${conf}\n` +
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
    `- SCOPE DISCIPLINE: Never use "the only", "the one exception", "uniquely", or similar exclusive claims.\n` +
    `  The articles are a sample, not a census. Something appearing once in the data means it was reported once — not that it is the sole instance.\n` +
    `- LINKS: Each signal has a URL. When a signal has a URL, embed a markdown link for every significant claim:\n` +
    `    In narrative: append ([source](URL)) after the relevant sentence\n` +
    `    In evidence items: append ([source](URL)) at end of the item\n` +
    `    If a signal has no URL, omit the link — do not fabricate URLs\n\n` +

    `━━━ THE 8 COMPONENTS (with pre-computed scores and signals) ━━━\n\n` +
    `${formatScoredComponentsForNarrative(scoredComponents, signalCatalogMap)}\n\n` +

    `━━━ OUTPUT FORMAT ━━━\n` +
    `Return ONLY valid JSON:\n` +
    `{\n` +
    `  "cross_component_synthesis": "<2 paragraphs — behavioral summary across all 8 components>",\n` +
    `  "evidence_quality_note": "<1 sentence on signal quality today: proportion of direct quotes vs reported facts>",\n` +
    `  "components": [\n` +
    `    {\n` +
    `      "component_id": "<id>",\n` +
    `      "manifestations_evidenced": ["<manifestation string>", ...],\n` +
    `      "manifestations_absent": ["<manifestation string>", ...],\n` +
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
