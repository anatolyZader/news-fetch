import { getDefaultLlmPort, createAnthropicLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { createLlmGateway } from '../../../cross-cut-modules/llm/llmGateway.js';
import { jsonrepair } from 'jsonrepair';
import {
  appendCostLog,
  calcInvocationCostUsd,
  checkDailyBudget,
  createCostTracker,
} from '../../../cross-cut-modules/budget/index.js';
import { findingDateFromPostedAt } from '../domain/services/osintBundleMerge.js';
import {
  retrieveSocialFewShotExamples,
  formatSocialFewShotBlock,
} from '../../../cross-cut-modules/retrieval/fieldRetrieval.js';
import { socialClassifyRagEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';

const MODEL = 'claude-haiku-4-5-20251001';
const BATCH_SIZE = 25;

const CLASSIFIER_SYSTEM = `You are a strict relevance classifier for community resilience behavioral analysis in Israel. For each social post, decide whether the text describes concrete, observable behavior of the Israeli civilian population under current emergency conditions.

INCLUDE if the post evidences: emergency actions (sheltering, evacuation, schools), institutional response/failure, civilian mental health, vulnerable populations, mutual aid, economic disruption from security situation, policy with immediate civilian behavioral impact.

EXCLUDE: military operations, political debate without civilian impact, diplomacy, lifestyle/sports, general health not tied to emergency, crime unless tied to emergency response, pure opinion without behavioral facts.

When uncertain, INCLUDE.

Return ONLY valid JSON: an array of objects. For each INCLUDED post use:
{"keep":true,"id":"...","date":"YYYY-MM-DD","location":"...","platform":"x|telegram_public","source_kind":"post","url":"...","quote_original":"...","quote_language":"he|ar|ru|en","quote_translation_he":null or string,"speaker_role":"תושב|...","behavior_or_emotion":"short Hebrew phrase","resilience_component":"narrative|information_communication|lifesaving_behavior|functional_continuity|community_capital|leadership|belonging_solidarity|wellbeing_at_risk","confidence":"גבוהה|בינונית|נמוכה","relevance_reason":"one Hebrew sentence","verification_notes":"short provenance"}

For EXCLUDED posts: {"keep":false,"id":"...","reason":"off_topic|official_speaker|no_citizen_quote|news_domain"}`;

/**
 * @param {object} candidate slim candidate for classification
 */
function candidateToPromptRow(candidate, index) {
  const text = String(candidate.text ?? '').slice(0, 400);
  return `[${index + 1}] id=${candidate.id} platform=${candidate.platform} @${candidate.handle ?? candidate.channel ?? ''} text=${JSON.stringify(text)}`;
}

/**
 * @param {string} text
 */
function parseClassifierJson(text) {
  const arrStart = text.indexOf('[');
  const arrEnd = text.lastIndexOf(']');
  if (arrStart === -1 || arrEnd === -1) throw new Error('Classifier returned no JSON array');
  const raw = text.slice(arrStart, arrEnd + 1);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = JSON.parse(jsonrepair(raw));
  }
  if (!Array.isArray(parsed)) throw new Error('Classifier returned non-array JSON');
  return parsed;
}

function recordRejectedRow(row, source, rejected, rejected_examples) {
  const reason = String(row.reason ?? 'off_topic');
  rejected[reason] = (rejected[reason] ?? 0) + 1;
  if (source?.url) rejected_examples.push({ url: source.url, reason });
}

function buildFindingFromRow(row, source) {
  const id = String(row.id ?? '');
  return {
    id,
    date: String(row.date ?? findingDateFromPostedAt(source?.postedAt)),
    location: String(row.location ?? source?.location ?? 'לא ברור'),
    platform: String(row.platform ?? source?.platform ?? 'x'),
    source_kind: String(row.source_kind ?? 'post'),
    url: String(row.url ?? source?.url ?? ''),
    quote_original: String(row.quote_original ?? source?.text ?? ''),
    quote_language: row.quote_language ?? source?.meta?.lang ?? 'he',
    quote_translation_he: row.quote_translation_he ?? null,
    speaker_role: String(row.speaker_role ?? 'לא ברור'),
    behavior_or_emotion: String(row.behavior_or_emotion ?? ''),
    resilience_component: String(row.resilience_component ?? 'narrative'),
    confidence: row.confidence ?? 'בינונית',
    relevance_reason: String(row.relevance_reason ?? ''),
    verification_notes: String(row.verification_notes ?? ''),
  };
}

function applyClassifierRows(rows, batch, findings, rejected, rejected_examples) {
  const byId = new Map(batch.map((c) => [String(c.id), c]));
  for (const row of rows) {
    const source = byId.get(String(row.id ?? ''));
    if (!row.keep) {
      recordRejectedRow(row, source, rejected, rejected_examples);
      continue;
    }
    findings.push(buildFindingFromRow(row, source));
  }
}

async function loadFewShotBlock(candidates, retrieval) {
  if (!socialClassifyRagEnabled() || !retrieval?.hybridRetrieve || candidates.length === 0) return '';
  const sampleQ = candidates
    .slice(0, 3)
    .map((c) => String(c.text ?? '').slice(0, 120))
    .join(' ');
  const examples = await retrieveSocialFewShotExamples(sampleQ, retrieval);
  return formatSocialFewShotBlock(examples);
}

/**
 * @param {object[]} candidates
 * @param {{ onUsage?: Function }} [opts]
 * @returns {Promise<{ findings: object[], rejected: Record<string, number>, rejected_examples: object[] }>}
 */
export async function classifySocialCandidates(candidates, opts = {}) {
  if (!candidates.length) {
    return { findings: [], rejected: {}, rejected_examples: [] };
  }

  if (!opts.skipBudgetCheck) checkDailyBudget();
  const llmPort = opts.llmPort ?? (
    opts.anthropicClient
      ? createLlmGateway(createAnthropicLlmPort({ client: opts.anthropicClient }))
      : getDefaultLlmPort()
  );
  const tracker = createCostTracker({ label: 'social-gather-classify' });

  /** @type {object[]} */
  const findings = [];
  const rejected = {};
  const rejected_examples = [];
  const fewShotBlock = await loadFewShotBlock(candidates, opts.retrieval ?? null);

  for (let offset = 0; offset < candidates.length; offset += BATCH_SIZE) {
    const batch = candidates.slice(offset, offset + BATCH_SIZE);
    const prompt = batch.map((c, i) => candidateToPromptRow(c, i)).join('\n');
    const userContent = fewShotBlock
      ? `${fewShotBlock}\nClassify these ${batch.length} posts:\n\n${prompt}`
      : `Classify these ${batch.length} posts:\n\n${prompt}`;

    const message = await llmPort.createMessage({
      model: MODEL,
      max_tokens: 8192,
      temperature: 0,
      system: CLASSIFIER_SYSTEM,
      messages: [{ role: 'user', content: userContent }],
      callContext: { feature: 'social_classify', purpose: `classify batch ${offset / BATCH_SIZE + 1}` },
    });

    const cost = calcInvocationCostUsd(MODEL, message.usage);
    tracker.onUsage({ label: `classify batch ${offset / BATCH_SIZE + 1}`, model: MODEL, usage: message.usage });
    opts.onUsage?.({ model: MODEL, usage: message.usage, cost });

    const text = message.content.find((b) => b.type === 'text')?.text ?? '';
    applyClassifierRows(parseClassifierJson(text), batch, findings, rejected, rejected_examples);
  }

  if (!opts.skipCostLog) {
    tracker.printSummary();
    const { totalCostUsd, usageLog, stageEvents } = tracker.getTotal();
    appendCostLog({
      script: 'social-gather-classify',
      date: new Date().toISOString().slice(0, 10),
      totalCostUsd,
      usageLog,
      stageEvents,
      articles: candidates.length,
    });
  }
  return { findings, rejected, rejected_examples };
}

/**
 * @param {object[]} posts normalized posts
 * @returns {object[]}
 */
export function postsToClassifierCandidates(posts) {
  return (posts ?? []).map((p) => ({
    id: p.id,
    platform: p.platform,
    text: p.text,
    url: p.url,
    location: p.location,
    postedAt: p.postedAt,
    handle: p.meta?.handle ?? p.meta?.channel,
    channel: p.meta?.channel,
    meta: p.meta,
  }));
}
