/**
 * Two-step LLM evaluation of a PBO event log against the 8 resilience components.
 *
 * Step 1 — Event classification: map each event to components + polarity.
 *           Uses standard (non-thinking) mode — structured classification task.
 * Step 2 — Synthesis & scoring: produce per-component scores and narratives.
 *           Uses adaptive thinking — complex temporal reasoning task.
 */

import Anthropic from '@anthropic-ai/sdk';
import { RESILIENCE_COMPONENTS } from './resilienceComponents.js';
import { formatEventsAsTable, CATEGORY_COMPONENT_HINTS } from './eventLogLoader.js';

const client = new Anthropic();

// ─── Prompt helpers ───────────────────────────────────────────────────────────

function formatComponentsForPrompt() {
  return RESILIENCE_COMPONENTS.map((c) => {
    let text =
      `**${c.id}** — ${c.name_en}\n` +
      `${c.description}`;
    if (c.key_elements?.length) {
      text += `\nKey elements: ${c.key_elements.join(' | ')}`;
    }
    if (c.principle) {
      text += `\nPrinciple: ${c.principle}`;
    }
    text += `\nGuiding questions: ${c.guiding_questions.join(' | ')}`;
    return text;
  }).join('\n\n');
}

function formatHints() {
  return Object.entries(CATEGORY_COMPONENT_HINTS)
    .map(([cat, comps]) => `  "${cat}" → ${comps.join(', ')}`)
    .join('\n');
}

// ─── JSON recovery (same pattern as news evaluator) ──────────────────────────

function extractJsonArray(text) {
  try {
    return extractJson(text);
  } catch {
    const objects = [];
    const re = /\{[\s\S]+?\}(?=\s*[,\]]|\s*$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      try { objects.push(JSON.parse(m[0])); } catch { /* skip malformed */ }
    }
    if (objects.length > 0) {
      console.error(`  ⚠ Recovered ${objects.length} partial event classifications`);
      return objects;
    }
    throw new Error('Could not recover valid JSON objects from Step 1 response');
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

// ─── Progress ─────────────────────────────────────────────────────────────────

async function streamWithProgress(stream, label) {
  process.stderr.write(`${label} `);
  let dots = 0;
  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta' &&
      ++dots % 150 === 0
    ) {
      process.stderr.write('.');
    }
  }
  process.stderr.write(' done\n');
}

// ─── Step 1: Event classification ────────────────────────────────────────────

/**
 * Classify each event against resilience components.
 *
 * @param {Object} parsedLog  Output of parseEventLog()
 * @returns {Array}           Array of classification objects
 */
export async function classifyEvents(parsedLog) {
  const table = formatEventsAsTable(parsedLog);

  const systemPrompt =
    `You are an expert in community resilience assessment and population behavior observation (PBO). ` +
    `You classify structured field observations from incident event logs against 8 resilience components.\n\n` +
    `THE 8 RESILIENCE COMPONENTS:\n\n${formatComponentsForPrompt()}\n\n` +
    `CATEGORY → COMPONENT REFERENCE HINTS (use these as a starting point, apply judgment):\n${formatHints()}\n\n` +
    `For EACH event row, produce a JSON object:\n` +
    `{\n` +
    `  "time": "<HH:MM>",\n` +
    `  "actor": "<actor>",\n` +
    `  "behavior": "<behavior>",\n` +
    `  "category": "<category>",\n` +
    `  "resilience_components": ["<component_id>", ...],\n` +
    `  "polarity": "positive" | "negative" | "mixed" | "neutral",\n` +
    `  "weight": 1 | 2 | 3,\n` +
    `  "note": "<optional short note on why, max 100 chars>"\n` +
    `}\n\n` +
    `Weight: 1 = routine / weak signal, 2 = moderate signal, 3 = strong signal.\n` +
    `Return ONLY a valid JSON array of all event classifications.`;

  const userContent =
    `Event log title: ${parsedLog.title}\n` +
    `Total events: ${parsedLog.events.length}\n\n` +
    `EVENT TABLE:\n${table}\n\n` +
    `Classify every event against the 8 resilience components.`;

  const stream = client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  await streamWithProgress(stream, '[Step 1 — Event classification]');
  const message = await stream.finalMessage();
  if (message.stop_reason === 'max_tokens') {
    console.error('  ⚠ Step 1 hit max_tokens — attempting partial recovery');
  }
  console.error(`  → stop_reason: ${message.stop_reason}`);

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Step 1: no text block in response');

  return extractJsonArray(textBlock.text);
}

// ─── Step 2: Synthesis & scoring ─────────────────────────────────────────────

/**
 * @param {Object} parsedLog         Original parsed event log
 * @param {Array}  classifications   Output of classifyEvents()
 * @param {string} date              YYYY-MM-DD
 * @returns {Object}                 Full assessment
 */
export async function synthesizeFromEvents(parsedLog, classifications, date) {
  const systemPrompt =
    `You are an expert community resilience analyst specialising in field observation data. ` +
    `Based on classified PBO event log entries, synthesise and score each of the 8 resilience components.\n\n` +
    `THE 8 RESILIENCE COMPONENTS:\n\n${formatComponentsForPrompt()}\n\n` +
    `SCORING RUBRIC (1–10):\n` +
    `1–2: Critical failure, dominant negative behaviors\n` +
    `3–4: Significant weakness, more negative than positive signals\n` +
    `5–6: Mixed — roughly balanced strengths and weaknesses\n` +
    `7–8: Generally positive, most behaviors are resilience-building\n` +
    `9–10: Strong, near-uniform positive behavioral signals\n\n` +
    `CONFIDENCE: "low" = few relevant events | "medium" = moderate evidence | "high" = many direct events\n\n` +
    `Also consider:\n` +
    `- Temporal patterns: did compliance improve or degrade over time?\n` +
    `- Actor diversity: range of actors contributing to each component\n` +
    `- Weight: higher-weight events count more toward the score\n\n` +
    `For EACH of the 8 components produce:\n` +
    `  component_id, score (1-10), confidence, key_positive_behaviors (array ≤5 strings), ` +
    `key_negative_behaviors (array ≤5 strings), temporal_trend ("improving"|"stable"|"degrading"|"unclear"), ` +
    `missing_observations (string), narrative (2–3 paragraphs)\n\n` +
    `Top-level fields:\n` +
    `  date, total_events_analyzed, overall_resilience_score (1-10),\n` +
    `  incident_summary (1 paragraph describing the event sequence),\n` +
    `  cross_component_synthesis (3–4 paragraphs),\n` +
    `  analyst_caveats (1–2 paragraphs on limitations of field observation data)\n\n` +
    `Return ONLY valid JSON:\n` +
    `{\n` +
    `  "date": "...", "total_events_analyzed": N, "overall_resilience_score": N,\n` +
    `  "incident_summary": "...", "cross_component_synthesis": "...", "analyst_caveats": "...",\n` +
    `  "components": [ { component_id, score, confidence, key_positive_behaviors, key_negative_behaviors,\n` +
    `                     temporal_trend, missing_observations, narrative } ... ]\n` +
    `}`;

  const userContent =
    `Date: ${date}\n` +
    `Event log: ${parsedLog.title}\n` +
    `Total events: ${parsedLog.events.length}\n\n` +
    `CLASSIFIED EVENTS:\n${JSON.stringify(classifications)}\n\n` +
    `Produce a complete 8-component resilience assessment.`;

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
  assessment.date = date;
  assessment.total_events_analyzed = parsedLog.events.length;
  return assessment;
}
