/**
 * Haiku-only qualitative evaluation of field survey responses.
 *
 * Step 1 (Haiku, batched + checkpointed):
 *   For each municipality, reads answers grouped by component.
 *   Produces qualitative findings (strengths, concerns, narrative). No scores.
 *
 * Step 2 (Haiku):
 *   Regional synthesis per component across all municipalities.
 */

import { writeFileSync, readFileSync, existsSync } from 'fs';
import Anthropic from '@anthropic-ai/sdk';
import { RESILIENCE_COMPONENTS } from '../../resilience/domain/resilienceComponents.js';

const client = new Anthropic();

const MODEL_SURVEY_HAIKU = 'claude-haiku-4-5-20251001';

const BATCH_SIZE = 6;
const BATCH_DELAY_MS = 4000;

const COMPONENT_NAMES = Object.fromEntries(
  RESILIENCE_COMPONENTS.map((c) => [c.id, c.name_en]),
);

// ─── JSON extraction ──────────────────────────────────────────────────────────

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
    const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
    if (end > start) return JSON.parse(text.slice(start, end + 1));
  }

  return JSON.parse(text.trim());
}

function extractJsonArray(text) {
  try {
    return extractJson(text);
  } catch {
    const objects = [];
    const re = /\{\s*"name"\s*:[\s\S]+?(?="name"\s*:|$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      try { objects.push(JSON.parse(m[0].replace(/,?\s*$/, '}'))); } catch { /* skip */ }
    }
    if (objects.length > 0) {
      console.error(`  ⚠ Partial recovery: ${objects.length} municipality objects`);
      return objects;
    }
    throw new Error('Could not parse JSON from response');
  }
}

// ─── Progress ─────────────────────────────────────────────────────────────────

async function streamWithProgress(stream, label) {
  process.stderr.write(`${label} `);
  let dots = 0;
  for await (const event of stream) {
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta' &&
      ++dots % 100 === 0
    ) {
      process.stderr.write('.');
    }
  }
  process.stderr.write(' done\n');
}

// ─── Retry with backoff ───────────────────────────────────────────────────────

async function withRetry(fn, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const wait = attempt * 6000;
      console.error(`  ⚠ ${label} failed (${err.message}), retry ${attempt} in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// ─── Step 1: Per-municipality qualitative findings (Haiku) ────────────────────

function buildMunicipalityInput(mun) {
  // Build a readable block of component → answers, skip empty components and context
  const sections = [];
  for (const [compId, items] of Object.entries(mun.byComponent)) {
    if (compId === 'context' || items.length === 0) continue;
    const name = COMPONENT_NAMES[compId] ?? compId;
    const qas = items.map((i) => `  Q: ${i.question}\n  A: ${i.answer}`).join('\n');
    sections.push(`[${compId} — ${name}]\n${qas}`);
  }

  // Append context answers as background
  const ctx = mun.byComponent.context ?? [];
  if (ctx.length > 0) {
    const ctxText = ctx.map((i) => `  ${i.question}: ${i.answer}`).join('\n');
    sections.push(`[BACKGROUND CONTEXT]\n${ctxText}`);
  }

  return sections.join('\n\n');
}

async function assessBatch(batch, batchNum, totalBatches, onUsage) {
  const componentList = RESILIENCE_COMPONENTS
    .map((c) => `- ${c.id}: ${c.name_en}`)
    .join('\n');

  const systemPrompt =
    `You are an expert community resilience analyst reviewing field survey reports ` +
    `from population behavior officers (PBOs) who visited municipalities during an emergency.\n\n` +
    `For each municipality, the survey answers are grouped by resilience component.\n` +
    `Produce a qualitative assessment — NO numeric scores.\n\n` +
    `THE 8 COMPONENTS:\n${componentList}\n\n` +
    `For each municipality return:\n` +
    `{\n` +
    `  "name": "<municipality>",\n` +
    `  "components": [\n` +
    `    {\n` +
    `      "component_id": "<id>",\n` +
    `      "confidence": "low|medium|high",\n` +
    `      "strengths": ["<max 3 concrete observations>"],\n` +
    `      "concerns": ["<max 3 concrete observations>"],\n` +
    `      "narrative": "<2-3 sentences summarising the situation for this component>"\n` +
    `    }\n` +
    `  ]\n` +
    `  (only include components that have survey answers — skip components with no data)\n` +
    `}\n\n` +
    `Return ONLY a valid JSON array of municipality objects.`;

  const munBlocks = batch.map((m) =>
    `=== ${m.name} ===\n${buildMunicipalityInput(m)}`,
  ).join('\n\n');

  const userContent =
    `Batch ${batchNum}/${totalBatches} — ${batch.length} municipalities:\n\n` +
    munBlocks +
    `\n\nAssess each municipality qualitatively across all available components.`;

  const stream = client.messages.stream({
    model: MODEL_SURVEY_HAIKU,
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  await streamWithProgress(stream, `[Step 1 — batch ${batchNum}/${totalBatches}]`);
  const message = await stream.finalMessage();
  if (onUsage) {
    onUsage({
      label: `[Step 1 — survey batch ${batchNum}/${totalBatches}]`,
      model: MODEL_SURVEY_HAIKU,
      usage: message.usage,
    });
  }

  if (message.stop_reason === 'max_tokens') {
    console.error(`  ⚠ Batch ${batchNum} hit max_tokens — attempting recovery`);
  }

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error(`Batch ${batchNum}: no text block`);
  return extractJsonArray(textBlock.text);
}

// ─── Checkpoint ───────────────────────────────────────────────────────────────

function cpPath(date, sourceFile) {
  const safe = sourceFile.replace(/[^\w\u0590-\u05FF.-]/g, '_');
  return `reports/survey-checkpoint-${date}-${safe}.json`;
}

function loadCheckpoint(path) {
  if (!existsSync(path)) return null;
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    console.error(`  ✓ Checkpoint found: ${data.municipality_assessments.length} municipalities already assessed — skipping Step 1`);
    return data.municipality_assessments;
  } catch { return null; }
}

function saveCheckpoint(path, assessments) {
  writeFileSync(
    path,
    JSON.stringify({ municipality_assessments: assessments, saved_at: new Date().toISOString() }, null, 2),
    'utf-8',
  );
  console.error(`  ✓ Checkpoint saved → ${path}`);
}

// ─── Step 2: Regional synthesis (Haiku) ──────────────────────────────────────

async function synthesizeRegional(munAssessments, date, onUsage) {
  const componentList = RESILIENCE_COMPONENTS
    .map((c) => `- ${c.id}: ${c.name_en}`)
    .join('\n');

  const systemPrompt =
    `You are an expert community resilience analyst. ` +
    `Synthesise qualitative field survey findings across ${munAssessments.length} municipalities ` +
    `in the Upper Galilee region into a regional picture.\n\n` +
    `THE 8 COMPONENTS:\n${componentList}\n\n` +
    `Return ONLY valid JSON:\n` +
    `{\n` +
    `  "executive_summary": "<3-4 paragraphs: cross-cutting patterns, notable strengths, main concerns>",\n` +
    `  "analyst_caveats": "<1 paragraph on limitations of field survey data>",\n` +
    `  "components": [\n` +
    `    {\n` +
    `      "component_id": "<id>",\n` +
    `      "confidence": "low|medium|high",\n` +
    `      "regional_strengths": ["<max 3>"],\n` +
    `      "regional_concerns": ["<max 3>"],\n` +
    `      "inter_municipality_variation": "<1 sentence on spread/outliers>",\n` +
    `      "narrative": "<2-3 paragraphs>"\n` +
    `    }\n` +
    `  ]\n` +
    `}`;

  const userContent =
    `Date: ${date}\n` +
    `Municipalities: ${munAssessments.map((m) => m.name).join(', ')}\n\n` +
    `PER-MUNICIPALITY FINDINGS:\n${JSON.stringify(munAssessments)}\n\n` +
    `Produce a regional qualitative synthesis.`;

  const stream = client.messages.stream({
    model: MODEL_SURVEY_HAIKU,
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  await streamWithProgress(stream, '[Step 2 — Regional synthesis]');
  const message = await stream.finalMessage();
  if (onUsage) {
    onUsage({
      label: '[Step 2 — Survey regional synthesis]',
      model: MODEL_SURVEY_HAIKU,
      usage: message.usage,
    });
  }

  if (message.stop_reason === 'max_tokens') {
    console.error('  ⚠ Step 2 hit max_tokens');
  }

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Step 2: no text block');
  return extractJson(textBlock.text);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {Array}  municipalities  Output of parseSurveyExcel().municipalities
 * @param {string} date            YYYY-MM-DD
 * @param {string} sourceFile      Basename of Excel (used for checkpoint naming)
 * @param {{ onUsage?: (e: { label: string, model: string, usage: object }) => void }} [options]
 * @returns {{ date, total_municipalities, regional, municipalities }}
 */
export async function analyzeSurvey(municipalities, date, sourceFile, options = {}) {
  const { onUsage } = options;
  const checkpoint = cpPath(date, sourceFile);

  // ── Step 1 (checkpointed) ────────────────────────────────────────────────
  let munAssessments = loadCheckpoint(checkpoint);

  if (!munAssessments) {
    const batches = [];
    for (let i = 0; i < municipalities.length; i += BATCH_SIZE) {
      batches.push(municipalities.slice(i, i + BATCH_SIZE));
    }

    munAssessments = [];
    for (let i = 0; i < batches.length; i++) {
      if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      const result = await withRetry(
        () => assessBatch(batches[i], i + 1, batches.length, onUsage),
        `batch ${i + 1}`,
      );
      munAssessments.push(...(Array.isArray(result) ? result : [result]));
    }

    saveCheckpoint(checkpoint, munAssessments);
  }

  console.error(`\n  → ${munAssessments.length} municipalities assessed`);

  // ── Step 2 ───────────────────────────────────────────────────────────────
  console.error('');
  const regional = await withRetry(
    () => synthesizeRegional(munAssessments, date, onUsage),
    'regional synthesis',
  );

  return {
    date,
    total_municipalities: municipalities.length,
    regional,
    municipalities: munAssessments,
  };
}
