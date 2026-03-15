/**
 * Two-step LLM evaluation using Claude API (claude-opus-4-6):
 *   Step 1 — Evidence extraction: scan all articles, tag snippets to components.
 *   Step 2 — Synthesis & scoring: score each component, produce final assessment.
 *
 * Uses streaming + adaptive thinking for quality and long-output handling.
 */

import Anthropic from '@anthropic-ai/sdk';
import { RESILIENCE_COMPONENTS } from './resilienceComponents.js';

const client = new Anthropic(); // uses ANTHROPIC_API_KEY from env

// ─── Prompt builders ──────────────────────────────────────────────────────────

function formatComponentsForPrompt() {
  return RESILIENCE_COMPONENTS.map(
    (c) =>
      `**${c.id}** — ${c.name_en} / ${c.name_he}\n` +
      `Description: ${c.description}\n` +
      `Guiding questions: ${c.guiding_questions.join(' | ')}`,
  ).join('\n\n');
}

function formatArticlesForPrompt(articles) {
  return articles
    .map(
      (a, i) =>
        `### [${i + 1}] ${a.title}\n` +
        `Source: ${a.source} (${a.sourceFile}) | Published: ${a.publishedAt}\n\n` +
        (a.body || '(no body text)'),
    )
    .join('\n\n---\n\n');
}

// ─── JSON extraction helper ───────────────────────────────────────────────────

/**
 * Like extractJson but specifically handles truncated JSON arrays:
 * if parsing the full text fails, collect all complete {...} objects found.
 */
function extractJsonArray(text) {
  try {
    return extractJson(text);
  } catch {
    // Salvage complete objects from a truncated array
    const objects = [];
    const re = /\{[\s\S]+?\}(?=\s*[,\]]|\s*$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      try { objects.push(JSON.parse(m[0])); } catch { /* skip malformed */ }
    }
    if (objects.length > 0) {
      console.error(`  ⚠ Recovered ${objects.length} partial evidence objects`);
      return objects;
    }
    throw new Error('Could not recover any valid JSON objects from Step 1 response');
  }
}

function extractJson(text) {
  // Strip fenced code block if present
  const fenced = text.match(/^```(?:json)?\s*\n([\s\S]+?)\n```\s*$/m);
  if (fenced) return JSON.parse(fenced[1].trim());

  // Find first JSON array or object in the text
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

// ─── Step 1: Evidence extraction ─────────────────────────────────────────────

/**
 * @param {Array} articles   Flat array from loadMdFiles()
 * @returns {Array}          Evidence snippet objects
 */
export async function extractEvidence(articles) {
  const systemPrompt =
    `You are an expert analyst specialising in community resilience assessment during emergencies in Israel. ` +
    `You analyse Hebrew news articles and extract evidence relevant to 8 resilience components.\n\n` +
    `THE 8 RESILIENCE COMPONENTS:\n\n${formatComponentsForPrompt()}\n\n` +
    `For EACH piece of evidence found, produce a JSON object:\n` +
    `{\n` +
    `  "article_title": "<article title>",\n` +
    `  "source": "<news site>",\n` +
    `  "quoted_text": "<most relevant Hebrew snippet, max 300 chars>",\n` +
    `  "resilience_components": ["<component_id>", ...],\n` +
    `  "polarity": "positive" | "negative" | "mixed" | "unclear",\n` +
    `  "rationale": "<brief English explanation, max 200 chars>"\n` +
    `}\n\n` +
    `Return ONLY a valid JSON array. Skip articles with no relevant evidence.`;

  const userContent =
    `Analyse these Israeli news articles and extract all evidence relevant to the 8 resilience components:\n\n` +
    formatArticlesForPrompt(articles);

  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  await streamWithProgress(stream, '[Step 1 — Evidence extraction]');

  const message = await stream.finalMessage();
  if (message.stop_reason === 'max_tokens') {
    console.error('  ⚠ Step 1 hit max_tokens — will attempt partial recovery');
  }
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Step 1: no text block in response');

  const snippets = extractJsonArray(textBlock.text);
  if (!Array.isArray(snippets)) throw new Error('Step 1: expected JSON array');
  console.error(`  → stop_reason: ${message.stop_reason}`);
  return snippets;
}

// ─── Step 2: Component synthesis & scoring ────────────────────────────────────

/**
 * @param {Array}  evidenceSnippets   Output of extractEvidence()
 * @param {string} date               YYYY-MM-DD string for the report
 * @param {number} totalArticles      Total articles analysed
 * @returns {Object}                  Full assessment object
 */
export async function synthesizeComponents(evidenceSnippets, date, totalArticles) {
  const systemPrompt =
    `You are an expert community resilience analyst. Based on extracted evidence from Israeli news articles, ` +
    `synthesise and score each of the 8 resilience components.\n\n` +
    `THE 8 RESILIENCE COMPONENTS:\n\n${formatComponentsForPrompt()}\n\n` +
    `SCORING RUBRIC (1–10):\n` +
    `1–2: Critical failure / severe weakness\n` +
    `3–4: Significant weakness with major gaps\n` +
    `5–6: Moderate — both strengths and weaknesses present\n` +
    `7–8: Generally positive with some gaps\n` +
    `9–10: Strong and effective\n\n` +
    `CONFIDENCE: "low" = few/indirect evidence | "medium" = moderate coverage | "high" = multiple direct items\n\n` +
    `For EACH of the 8 components produce:\n` +
    `  component_id, score (int 1-10), confidence, supporting_evidence (array ≤5), ` +
    `weakening_evidence (array ≤5), missing_evidence (string), narrative (2-3 paragraphs)\n\n` +
    `Also produce top-level fields:\n` +
    `  date, total_articles_analyzed, overall_resilience_score (1-10),\n` +
    `  cross_component_synthesis (3-4 paragraphs),\n` +
    `  media_bias_caveats (1-2 paragraphs)\n\n` +
    `Return ONLY valid JSON matching this structure:\n` +
    `{\n` +
    `  "date": "YYYY-MM-DD",\n` +
    `  "total_articles_analyzed": N,\n` +
    `  "overall_resilience_score": N,\n` +
    `  "cross_component_synthesis": "...",\n` +
    `  "media_bias_caveats": "...",\n` +
    `  "components": [ { component_id, score, confidence, supporting_evidence, weakening_evidence, missing_evidence, narrative }, ... ]\n` +
    `}`;

  const userContent =
    `Date: ${date}\nTotal articles: ${totalArticles}\n\n` +
    `EXTRACTED EVIDENCE:\n${JSON.stringify(evidenceSnippets, null, 2)}\n\n` +
    `Produce a complete 8-component resilience assessment with scoring.`;

  const stream = client.messages.stream({
    model: 'claude-opus-4-6',
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  await streamWithProgress(stream, '[Step 2 — Synthesis & scoring]');

  const message = await stream.finalMessage();
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Step 2: no text block in response');

  const assessment = extractJson(textBlock.text);
  // Ensure top-level fields are set
  assessment.date = date;
  assessment.total_articles_analyzed = totalArticles;
  return assessment;
}
