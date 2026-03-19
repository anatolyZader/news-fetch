/**
 * Two-step LLM evaluation of Facebook group posts against the 8 resilience components.
 *
 * Step 1 (Haiku, batched): Extract evidence snippets from posts — same pattern as news pipeline.
 * Step 2 (Haiku): Synthesize per-municipality qualitative findings.
 */

import Anthropic from '@anthropic-ai/sdk';
import { RESILIENCE_COMPONENTS } from './resilienceComponents.js';

const client = new Anthropic();

const STEP1_BATCH_SIZE = 50;
const STEP1_MAX_POST_CHARS = 400;
const MAX_EVIDENCE_PER_COMPONENT = 6;
const BATCH_DELAY_MS = 3000;

// ─── Component formatters ─────────────────────────────────────────────────────

function formatComponentsCompact() {
  return RESILIENCE_COMPONENTS.map((c) => `- **${c.id}**: ${c.name_en}`).join('\n');
}

function formatComponentsFull() {
  return RESILIENCE_COMPONENTS.map((c) => {
    let text = `**${c.id}** — ${c.name_en}\n${c.description}`;
    if (c.key_elements?.length) text += `\nKey elements: ${c.key_elements.join(' | ')}`;
    if (c.principle) text += `\nPrinciple: ${c.principle}`;
    text += `\nGuiding questions: ${c.guiding_questions.join(' | ')}`;
    return text;
  }).join('\n\n');
}

// ─── JSON extraction ──────────────────────────────────────────────────────────

function extractJson(text) {
  const fenced = text.match(/^```(?:json)?\s*\n([\s\S]+?)\n```\s*$/m);
  if (fenced) return JSON.parse(fenced[1].trim());
  const arrIdx = text.indexOf('[');
  const objIdx = text.indexOf('{');
  const start = arrIdx === -1 ? objIdx : objIdx === -1 ? arrIdx : Math.min(arrIdx, objIdx);
  if (start !== -1) {
    const end = Math.max(text.lastIndexOf(']'), text.lastIndexOf('}'));
    if (end > start) return JSON.parse(text.slice(start, end + 1));
  }
  return JSON.parse(text.trim());
}

function extractJsonArray(text) {
  try { return extractJson(text); } catch {
    const objects = [];
    const re = /\{[\s\S]+?\}(?=\s*[,\]]|\s*$)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      try { objects.push(JSON.parse(m[0])); } catch { /* skip */ }
    }
    if (objects.length > 0) {
      console.error(`  ⚠ Partial recovery: ${objects.length} evidence items`);
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
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta' && ++dots % 100 === 0) {
      process.stderr.write('.');
    }
  }
  process.stderr.write(' done\n');
}

// ─── Retry ────────────────────────────────────────────────────────────────────

async function withRetry(fn, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try { return await fn(); } catch (err) {
      if (attempt === maxRetries) throw err;
      const wait = attempt * 6000;
      console.error(`  ⚠ ${label} failed (${err.message}), retry ${attempt} in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
}

// ─── Step 1: Evidence extraction (Haiku, batched) ────────────────────────────

function formatPostsForPrompt(posts) {
  return posts.map((p, i) =>
    `### [${i + 1}] ${p.publishedAt ? new Date(p.publishedAt).toLocaleDateString('he-IL') : ''} | 👍${p.likeCount} 💬${p.commentCount}\n${p.text.slice(0, STEP1_MAX_POST_CHARS)}`,
  ).join('\n\n---\n\n');
}

async function extractEvidenceBatch(posts, batchNum, totalBatches, municipalityName) {
  const systemPrompt =
    `You are an expert in community resilience assessment. ` +
    `Analyse Facebook group posts from the local community of ${municipalityName} during an emergency. ` +
    `Extract evidence relevant to the 8 resilience components.\n\n` +
    `THE 8 COMPONENTS:\n${formatComponentsCompact()}\n\n` +
    `IMPORTANT CONTEXT: These are informal social media posts — expect emotional language, ` +
    `rumors, slang, and unverified claims. Note credibility where relevant.\n\n` +
    `For each relevant post extract:\n` +
    `{\n` +
    `  "post_index": <1-based number>,\n` +
    `  "component_id": "<id>",\n` +
    `  "quote": "<verbatim excerpt, max 200 chars>",\n` +
    `  "polarity": "positive|negative|mixed|neutral",\n` +
    `  "weight": 1|2|3,\n` +
    `  "credibility": "direct_observation|hearsay|rumor|official",\n` +
    `  "note": "<optional, max 60 chars>"\n` +
    `}\n\n` +
    `Weight: 1=weak signal, 2=moderate, 3=strong. ` +
    `One post may yield multiple evidence items for different components. ` +
    `Skip posts with no resilience relevance. ` +
    `Return ONLY a valid JSON array.`;

  const userContent =
    `Municipality: ${municipalityName} | Batch ${batchNum}/${totalBatches} | ${posts.length} posts\n\n` +
    formatPostsForPrompt(posts) +
    `\n\nExtract all resilience evidence from these posts.`;

  const stream = client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 8000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  await streamWithProgress(stream, `[Step 1 — batch ${batchNum}/${totalBatches}]`);
  const message = await stream.finalMessage();
  if (message.stop_reason === 'max_tokens') {
    console.error(`  ⚠ Batch ${batchNum} hit max_tokens`);
  }

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error(`Batch ${batchNum}: no text block`);
  return extractJsonArray(textBlock.text);
}

// ─── Step 2: Synthesis (Haiku) ────────────────────────────────────────────────

async function synthesizeMunicipality(municipalityName, evidence, totalPosts, filteredPosts, date) {
  // Filter to top evidence per component
  const byComponent = {};
  for (const item of evidence) {
    if (!byComponent[item.component_id]) byComponent[item.component_id] = [];
    byComponent[item.component_id].push(item);
  }
  // Keep top MAX_EVIDENCE_PER_COMPONENT per component (highest weight first)
  const topEvidence = Object.values(byComponent).flatMap((items) =>
    items.sort((a, b) => (b.weight ?? 1) - (a.weight ?? 1)).slice(0, MAX_EVIDENCE_PER_COMPONENT),
  );

  const systemPrompt =
    `You are an expert community resilience analyst. ` +
    `Based on evidence extracted from Facebook community group posts in ${municipalityName}, ` +
    `produce a qualitative resilience assessment. No numeric scores.\n\n` +
    `THE 8 COMPONENTS:\n\n${formatComponentsFull()}\n\n` +
    `SOCIAL MEDIA CONTEXT: Evidence comes from informal posts — weight direct observations ` +
    `and high-engagement posts more heavily. Note where evidence is hearsay or unverified.\n\n` +
    `CONFIDENCE: "low"=few posts | "medium"=moderate | "high"=many direct posts\n\n` +
    `Return ONLY valid JSON:\n` +
    `{\n` +
    `  "summary": "<2-3 paragraphs: overall resilience picture from social media lens>",\n` +
    `  "analyst_caveats": "<1 paragraph on social media data limitations>",\n` +
    `  "components": [\n` +
    `    {\n` +
    `      "component_id": "<id>",\n` +
    `      "confidence": "low|medium|high",\n` +
    `      "strengths": ["<max 3>"],\n` +
    `      "concerns": ["<max 3>"],\n` +
    `      "notable_posts": ["<max 2 verbatim quotes that best illustrate the situation>"],\n` +
    `      "narrative": "<2-3 sentences>"\n` +
    `    }\n` +
    `  ]\n` +
    `  (only include components with evidence)\n` +
    `}`;

  const userContent =
    `Municipality: ${municipalityName} | Date: ${date}\n` +
    `Total posts scraped: ${totalPosts} | Homefront-relevant: ${filteredPosts}\n\n` +
    `EVIDENCE:\n${JSON.stringify(topEvidence)}\n\n` +
    `Produce a qualitative social media resilience assessment for ${municipalityName}.`;

  const stream = client.messages.stream({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 6000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  });

  await streamWithProgress(stream, '[Step 2 — Synthesis]');
  const message = await stream.finalMessage();
  if (message.stop_reason === 'max_tokens') console.error('  ⚠ Step 2 hit max_tokens');

  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error('Step 2: no text block');
  return extractJson(textBlock.text);
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * @param {{ name, posts }} municipality
 * @param {number} totalPosts     Total posts before filtering
 * @param {string} date           YYYY-MM-DD
 * @returns {{ date, municipality, summary, analyst_caveats, components }}
 */
export async function analyzeMunicipalitySocialMedia(municipality, totalPosts, date) {
  const { name, posts } = municipality;
  console.error(`  Posts: ${posts.length} homefront-relevant`);

  if (posts.length === 0) {
    return { date, municipality: name, summary: 'No relevant posts found.', components: [] };
  }

  // Step 1: extract evidence in batches
  const batches = [];
  for (let i = 0; i < posts.length; i += STEP1_BATCH_SIZE) {
    batches.push(posts.slice(i, i + STEP1_BATCH_SIZE));
  }

  const allEvidence = [];
  for (let i = 0; i < batches.length; i++) {
    if (i > 0) await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    const result = await withRetry(
      () => extractEvidenceBatch(batches[i], i + 1, batches.length, name),
      `Step 1 batch ${i + 1}`,
    );
    allEvidence.push(...(Array.isArray(result) ? result : []));
  }

  console.error(`  → ${allEvidence.length} evidence items extracted\n`);

  // Step 2: synthesize
  const synthesis = await withRetry(
    () => synthesizeMunicipality(name, allEvidence, totalPosts, posts.length, date),
    'Step 2 synthesis',
  );

  return { date, municipality: name, ...synthesis };
}
