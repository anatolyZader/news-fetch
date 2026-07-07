import { createHash } from 'node:crypto';
import {
  isMultipassEnabled,
  getMultipassGroupKeys,
  buildPassScopeSuffix,
  buildSelfCheckPrompt,
} from './extractionPasses.js';
import {
  formatSignalCatalog,
  formatDisambiguationBlock,
} from '../domain/services/signalCatalogPrompt.js';
import { dedupeSignalsWithinBatch } from './signalVerification.js';
import { embedText, embeddingsEnabled, embeddingModelId } from '../../../cross-cut-modules/vector_index/index.js';
import {
  captureBatchLearningSignals,
  logSelfCheckUncertain,
} from './learningCapture.js';
import { extractJsonArray } from './claudeJsonHelpers.js';
import { validateSignalsFromCall } from './claudeSignalValidation.js';
import { applyEvidenceVerifier, splitParagraphs } from './claudeEvidenceVerification.js';
import { DOMAIN_INTENT_QUERIES } from '../../../cross-cut-modules/retrieval/domainIntentQueries.js';
import { selectArticlePromptSpans } from '../../../cross-cut-modules/retrieval/pipelineRetrieval.js';
import { resilienceExtractRagEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';
import { getDefaultLlmPort } from '../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import {
  EXTRACT_PROMPT_ID,
  EXTRACT_PROMPT_VERSION,
  extractMaxTokens,
  selfCheckMaxTokensCap,
  extractBatchEnabled,
  buildExtractionSystemParts,
  extractRationaleEnabled,
} from '../../../cross-cut-modules/resilience-contracts/extractionPrompt.js';
import { runExtractionBatchCalls } from './extractionBatchRunner.js';
import {
  partitionArticlesByExtractCache,
  remapMissBatchIndices,
  persistArticleExtractCache,
} from '../../../cross-cut-modules/llm/cache/extractionCacheIntegration.js';

const DEFAULT_EXTRACT_MODEL = process.env.RESILIENCE_EXTRACT_MODEL ?? 'claude-haiku-4-5-20251001';
const DEFAULT_SELF_CHECK_MODEL = process.env.RESILIENCE_SELF_CHECK_MODEL ?? 'claude-haiku-4-5-20251001';

// ─── Signal catalog formatter (re-exported from domain) ─────────────────────

function formatSignalCatalogForPrompt() {
  return formatSignalCatalog();
}
export async function streamWithProgress(stream, label) {
  process.stderr.write(`${label} `);
  let dots = 0;
  for await (const event of stream) {
    dots += 1;
    if (
      event.type === 'content_block_delta' &&
      event.delta.type === 'text_delta' &&
      dots % 200 === 0
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

function formatArticlesForPrompt(preparedArticles) {
  return preparedArticles
    .map(
      (a, i) => {
        const sourceIdLine = a.source_id ? `Source ID: ${a.source_id}\n` : '';
        return (
          `### [${i + 1}] ${a.title}\n` +
          `Source: ${a.source} | Published: ${a.publishedAt}\n` +
          sourceIdLine +
          `URL: ${a.url || '(no url)'}\n\n` +
          (a.promptBody || extractTopKParagraphsByRelevance(a.body, 6) || '(no body text)')
        );
      },
    )
    .join('\n\n---\n\n');
}



const SEMANTIC_SELECT_CACHE = new Map(); // key -> Float32Array

function sha256Hex(s) {
  return createHash('sha256').update(String(s ?? '')).digest('hex');
}

// ─── Decision-trace helpers (A) + rationale parsing (B) ──────────────────────

/** Temporary fields attached for the decision trace; never persisted to bundles. */
const TRACE_ONLY_SIGNAL_FIELDS = ['rationale', '_pass', '_dropped_reason', '_self_check', '_from_cache'];

/** Drop trace-only / B-only fields so written signal bundles stay clean. */
export function stripTraceFields(signal) {
  if (!signal || typeof signal !== 'object') return signal;
  const clean = { ...signal };
  for (const f of TRACE_ONLY_SIGNAL_FIELDS) delete clean[f];
  return clean;
}

const REJECTED_OBJECT_RE = /\{[^{}]*"_rejected"[\s\S]*\}/;

/** Parse the trailing `{"_rejected": [...]}` object emitted in trace mode (B). */
function parseRejectedCandidates(text) {
  try {
    const m = REJECTED_OBJECT_RE.exec(String(text ?? ''));
    if (!m) return [];
    const obj = JSON.parse(m[0]);
    return Array.isArray(obj?._rejected) ? obj._rejected : [];
  } catch {
    return [];
  }
}

/** Stable-ish identity for tracking a signal's fate across pipeline stages. */
function signalTraceKey(s) {
  return `${s?.article_index ?? '?'}|${s?.signal_type ?? '?'}|${String(s?.evidence ?? '').slice(0, 120)}`;
}

function classifyTraceStatus(key, sets) {
  if (!sets.afterInBatch.has(key)) return { status: 'dropped', dropped_by: 'in_batch_dedup' };
  if (!sets.afterSemantic.has(key)) return { status: 'dropped', dropped_by: 'semantic_dedup' };
  if (!sets.afterValidate.has(key)) return { status: 'dropped', dropped_by: 'validation' };
  if (!sets.afterVerifier.has(key)) return { status: 'dropped', dropped_by: 'evidence_verifier' };
  if (!sets.afterSelfCheck.has(key)) return { status: 'dropped', dropped_by: 'self_check' };
  return { status: 'kept', dropped_by: null };
}

function traceSelfCheck(s) {
  if (s._self_check) return s._self_check;
  if (s._dropped_reason?.stage === 'self_check') {
    return { verdict: 'no', reason: s._dropped_reason.reason };
  }
  return null;
}

function emitBatchTrace({ trace, articles, contentKind, batchLabel, candidates, sets }) {
  const byArticle = new Map();
  for (const s of candidates) {
    const idx = s.article_index ?? 1;
    if (!byArticle.has(idx)) byArticle.set(idx, []);
    byArticle.get(idx).push(s);
  }
  for (const [idx, cands] of byArticle) {
    const art = articles[idx - 1] ?? {};
    const signals = cands.map((s) => {
      const { status, dropped_by } = classifyTraceStatus(signalTraceKey(s), sets);
      return {
        signal_type: s.signal_type ?? null,
        evidence: s.evidence ?? '',
        confidence: s.confidence ?? null,
        extraction_confidence: s.extraction_confidence ?? null,
        rationale: s.rationale ?? null,
        self_check: traceSelfCheck(s),
        status,
        dropped_by,
        pass: s._pass ?? null,
      };
    });
    const body = art.body ?? '';
    trace.item({
      source_type: contentKind,
      batch: batchLabel,
      pass: cands[0]?._pass ?? null,
      from_cache: cands.length > 0 && cands.every((s) => s._from_cache === true),
      article: {
        title: art.title ?? null,
        source: art.source ?? null,
        url: art.url ?? null,
        source_id: art.source_id ?? null,
      },
      raw_text: body,
      raw_text_len: body.length,
      rag_trimmed: Boolean(art.promptBody && art.promptBody !== body),
      signals,
    });
  }
}

function semanticSelectionEnabled() {
  if (process.env.RESILIENCE_SEMANTIC_SPAN_SELECTION === '0') return false;
  return embeddingsEnabled();
}

async function embedCached(text, model) {
  const clean = String(text ?? '').trim();
  const key = `${model}:${sha256Hex(clean)}`;
  const cached = SEMANTIC_SELECT_CACHE.get(key);
  if (cached) return cached;
  const emb = await embedText(clean, { model });
  SEMANTIC_SELECT_CACHE.set(key, emb.vector);
  return emb.vector;
}

function dot(a, b) {
  const n = Math.min(a.length, b.length);
  let s = 0;
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

function norm(a) {
  return Math.sqrt(dot(a, a)) || 1;
}

function cosine(a, b) {
  return dot(a, b) / (norm(a) * norm(b));
}

async function extractTopKParagraphsBySemanticRelevance(body, domainGroupKey, k = 6) {
  const paragraphs = splitParagraphs(body);
  if (paragraphs.length === 0) return '';
  if (paragraphs.length <= k) return paragraphs.join('\n\n');

  const model = embeddingModelId();
  const query = DOMAIN_INTENT_QUERIES[domainGroupKey] ?? DOMAIN_INTENT_QUERIES.B;
  const qv = await embedCached(query, model);

  // Hard cap: don’t embed too many paragraphs per article.
  const capped = paragraphs.slice(0, 36);
  const vecs = await Promise.all(capped.map((p) => embedCached(p, model)));

  const scored = capped.map((p, idx) => ({
    p,
    idx,
    score: cosine(qv, vecs[idx]),
  }));

  const byScore = scored.toSorted((a, b) => b.score - a.score || a.idx - b.idx);
  const topK = byScore.slice(0, k).toSorted((a, b) => a.idx - b.idx);

  return topK.map((x) => x.p).join('\n\n');
}

async function resolveArticlePromptBody(article, { useRag, useSemantic, retrievalService, domainGroupKey, reportDate }) {
  if (useRag) {
    try {
      const ragBody = await selectArticlePromptSpans(article, {
        retrieval: retrievalService.retrieval,
        domainGroupKey,
        reportDate,
      });
      if (ragBody) return ragBody;
    } catch {
      /* fall through to semantic */
    }
  }
  if (useSemantic) {
    try {
      return await extractTopKParagraphsBySemanticRelevance(article.body, domainGroupKey, 6);
    } catch {
      return '';
    }
  }
  return '';
}

async function prepareArticlesForPrompt(articles, {
  contentKind = 'news',
  domainGroupKey = null,
  retrievalService = null,
  reportDate = null,
} = {}) {
  const skipInteractive = contentKind === 'whatsapp_realtime' || contentKind === 'whatsapp_interactive';
  const useRag = !skipInteractive && resilienceExtractRagEnabled() && retrievalService?.retrieval;
  const useSemantic = !skipInteractive && !useRag && semanticSelectionEnabled();
  const spanOpts = { useRag, useSemantic, retrievalService, domainGroupKey, reportDate };
  const out = [];
  for (const a of articles) {
    const promptBody = await resolveArticlePromptBody(a, spanOpts);
    out.push({ ...a, promptBody });
  }
  return out;
}

const AUDIO_SIGNAL_EXTRACTION_PREFIX =
  `━━━ SOURCE: SPOKEN AUDIO (TRANSCRIPTS) ━━━\n` +
  `Input is speech-to-text from Israeli audio (broadcast, podcast, video rip, interview, voice memo, etc.). Speaker labels may appear (e.g. SPEAKER_00, host/guest).\n` +
  `Treat clearly attributed speech as quotable evidence when a person or role is identified.\n` +
  `Skip music-only or ad segments with no behavioral content.\n\n` +
  `⚠ CRITICAL — RADIO TALK SHOWS MIX RELEVANT AND IRRELEVANT CONTENT.\n` +
  `Israeli radio broadcasts contain hours of general political, geopolitical, and social commentary\n` +
  `alongside emergency-relevant civilian resilience content. You MUST be highly selective.\n` +
  `ONLY extract signals when the content directly describes:\n` +
  `  - Israeli civilians coping with the emergency (shelter behavior, evacuation, daily life disruption)\n` +
  `  - Services operating or failing during the emergency (schools, hospitals, transport, welfare)\n` +
  `  - Community-level emergency response (volunteers, mutual aid, leadership actions for emergency)\n` +
  `  - Economic hardship directly caused by the emergency (business closure, compensation gaps, job loss)\n` +
  `  - Psychological impact of the emergency on civilians (fear, trauma, distress, coping)\n` +
  `DO NOT EXTRACT from radio:\n` +
  `  - Geopolitical analysis or strategy discussions (Iran, diplomacy, regime change, international relations)\n` +
  `  - Military/intelligence organizational debates (army appointments, personnel decisions, institutional law)\n` +
  `  - Domestic political punditry (coalition politics, Haredi-state relations, media framing of political leaks)\n` +
  `  - Israeli-Palestinian political commentary (annexation policy, displacement policy, peace process)\n` +
  `  - Criminal/accident investigations with no emergency resilience relevance\n` +
  `  - Expert/pundit opinions on strategy, even if they use words like "guidance" or "clarity"\n` +
  `An expert explaining Iranian strategy is NOT "information_clarity".\n` +
  `A pundit criticizing army personnel decisions is NOT "leadership_clear_guidance".\n` +
  `A civilian complaining about economic aid delays is "resource_shortage", NOT "information_effectiveness_gap".\n\n`;

const FIELD_REPORT_SIGNAL_EXTRACTION_PREFIX =
  `━━━ SOURCE: EXPERT FIELD REPORTS (POPULATION BEHAVIOR OFFICER VISITS) ━━━\n` +
  `Input is Hebrew expert field notes written by trained resilience professionals after face-to-face visits to northern border communities.\n` +
  `Each document = one community visit. Notes are shorthand bullets, not journalism prose — read them as synthesis of observed conditions and stakeholder interviews.\n\n` +
  `Domain vocabulary (always translate these into English in the evidence field):\n` +
  `  ממ"ד = individual safe room (in-home shelter); מקלט = public shelter; מיגונית = armored field protection booth (for farmers in open fields)\n` +
  `  צח"י / צח"י = Home Front Command volunteer corps (civilian emergency unit); כיתת כוננות = community readiness unit\n` +
  `  גרעין נחל / גרעין נח"ל = army education core embedded in a community; מורות חיילות = soldier-teachers deployed to communities\n` +
  `  פיקוד העורף = Home Front Command (HFC/Pikud HaOref); רכזת/רכז קהילה = community coordinator\n` +
  `  שחיקה = burnout / cumulative erosion; הפגה = relief/decompression activity; אתרעה / אזעקה = alert siren\n` +
  `  גיל שלישי / קשישים = elderly population; אוכלוסיה עם מוגבלויות = people with disabilities\n\n` +
  `Evidence type rules:\n` +
  `  "observational_reported_fact" — expert team's direct community-level observation (most common; the expert visit IS the named institutional observation)\n` +
  `  "named_institutional_fact" — a named local body (council, HFC unit, welfare dept.) takes a concrete named action\n` +
  `  "direct_quote_named_person" — only when a named individual is explicitly quoted\n` +
  `  Never use "named_survey_statistic" for field reports.\n\n` +
  `Scope rules:\n` +
  `  Each document = one community. Default to "repeated_pattern" (community-wide observation).\n` +
  `  Use "quantified_or_broad" only when explicit counts or percentages appear (e.g. "30 homes without safe room", "60% functional continuity").\n` +
  `  Use "single_case" only for a clearly isolated individual incident.\n\n` +
  `Always include municipality name in the evidence text so the signal is geographically traceable.\n\n` +
  `Abstention rules (do NOT emit a signal):\n` +
  `  - Empty cells, whitespace-only, or non-informative stubs: "אין", "ללא שינוי", "אותו דבר", "אותו הדבר"\n` +
  `  - Officer score summaries or form metadata — never write "avg=N%" or replicate numeric component scores\n` +
  `  - A component row with no behavioral prose behind it\n\n` +
  `One signal per DISTINCT behavioral fact — not one signal per form row or component column.\n` +
  `  If the same fact touches multiple resilience domains, emit ONE signal with the best-fitting signal_type;\n` +
  `  cross-component effects are applied later by the scoring graph (do not duplicate the observation).\n\n` +
  `⚠ Field reports are dense — each community paragraph often contains 5-15 distinct facts spanning multiple\n` +
  `  resilience domains (leadership, services, protection, wellbeing, community capital, etc.).\n` +
  `  Split every distinct fact into its own signal. Do NOT collapse a paragraph into one or two summary signals.\n` +
  `  Do NOT emit one signal per component column when the underlying observation is the same.\n` +
  `  Walk through each clause/phrase and ask: what signal type does THIS fact belong to?\n` +
  `  Example: "צח״י active; donation received; informal activity for children; call to social services"\n` +
  `  → 4 separate signals: leadership_visible_presence + community_volunteering, resource_mobilization,\n` +
  `    service_continuity, wellbeing_support_accessed.\n` +
  `  Example: "חסר גרעין קהילתי; המלצה לרווחה לפתח מימד מנהיגות ופעילות משותפת"\n` +
  `  → coordination_failure (NOT institutional_abandonment_perception unless residents explicitly say\n` +
  `    the state abandoned or forgot them).\n\n`;

const WHATSAPP_REALTIME_SIGNAL_EXTRACTION_PREFIX =
  `━━━ SOURCE: WHATSAPP FIELD REPORT (SINGLE MESSAGE, REAL-TIME) ━━━\n` +
  `Input is a single short WhatsApp message from an Israeli field worker reporting conditions\n` +
  `in a northern border community. Messages may be very brief (1-2 sentences).\n\n` +
  `IMPORTANT DIFFERENCES FROM BATCH ANALYSIS:\n` +
  `- You are analyzing ONE message, not a batch. article_index is always 1.\n` +
  `- Short status reports ("שקט בקריית שמונה", "בתי ספר פתוחים בנהריה") ARE valid —\n` +
  `  extract what you can, even if only one signal.\n` +
  `- Default evidence type is "observational_reported_fact" — field workers report what they observe.\n` +
  `  Use "direct_quote_named_person" only when the message explicitly quotes someone by name.\n` +
  `  Use "named_institutional_fact" when a named institution's action is reported.\n` +
  `- After the signal array, add a JSON object on a NEW line:\n` +
  `  {"_assessment": {"sufficient": true, "missing": []}}\n` +
  `  "sufficient" = true if the message contains at least one concrete, extractable behavioral fact.\n` +
  `  "missing" = list of what would strengthen the report. Values: "location", "named_person", "scope", "specific_details".\n` +
  `  Set "missing" to [] if sufficient. If not sufficient, include the most important missing element(s).\n\n`;

const WHATSAPP_INTERACTIVE_SIGNAL_EXTRACTION_PREFIX =
  `━━━ SOURCE: WHATSAPP INTERACTIVE FIELD DIALOGUE (MULTI-TURN) ━━━\n` +
  `Input is an ongoing WhatsApp conversation between a field officer and an elicitation bot.\n` +
  `Each turn is tagged [officer] or [bot]. Interpret the CUMULATIVE content across all turns —\n` +
  `facts from earlier turns remain valid unless the officer explicitly revises them.\n\n` +
  `YOUR JOB IS THREEFOLD:\n` +
  `1) Extract behavioral signals using the same closed vocabulary as batch analysis.\n` +
  `2) Emit a _structured summary of what the officer has conveyed so far.\n` +
  `3) Emit an _assessment that lists missing evidence per component and 2–3 concise Hebrew\n` +
  `   follow-up questions aimed at the highest-value gaps.\n\n` +
  `CRITICAL RULES:\n` +
  `- article_index is always 1.\n` +
  `- Default evidence type is "observational_reported_fact". Upgrade to\n` +
  `  "direct_quote_named_person" / "named_institutional_fact" only if the officer wrote so.\n` +
  `- DO NOT INVENT facts. If the officer did not state a field, leave it null.\n` +
  `- DO NOT SCORE components or declare resilience levels. Only link components with\n` +
  `  direction ∈ {positive, negative, mixed} and a short rationale.\n` +
  `- Use only these closed-vocabulary values:\n` +
  `    spread: "isolated" | "noticeable" | "widespread"\n` +
  `    sourceBasis: "direct" | "staff" | "residents" | "mixed"\n` +
  `    comparisonToPrior: "new" | "stable" | "worsening" | "improving"\n` +
  `    direction: "positive" | "negative" | "mixed"\n` +
  `    confidence.level: "low" | "medium" | "high"\n` +
  `    componentId ∈ ["narrative","information_communication","lifesaving_behavior",\n` +
  `                   "functional_continuity","community_capital","leadership",\n` +
  `                   "belonging_solidarity","wellbeing_at_risk"]\n\n` +
  `OUTPUT FORMAT (three JSON fragments, in order, each on its own line):\n` +
  `1) JSON array of signal objects (same schema as batch).\n` +
  `2) Then a single-line JSON object:\n` +
  `   {"_structured": {\n` +
  `     "observation": {\n` +
  `       "locality": <string|null>,\n` +
  `       "timeframe": <string|null>,\n` +
  `       "behavior": <string|null>,\n` +
  `       "affectedPopulation": <string|null>,\n` +
  `       "spread": <one of allowed values or null>,\n` +
  `       "sourceBasis": <one of allowed values or null>,\n` +
  `       "comparisonToPrior": <one of allowed values or null>\n` +
  `     },\n` +
  `     "interpretation": { "possibleDrivers": [<string>], "alternatives": [<string>] },\n` +
  `     "componentLinks": [ {"componentId": <id>, "direction": <dir>, "rationale": <short Hebrew>} ],\n` +
  `     "confidence": { "level": <level>, "basis": <short Hebrew> }\n` +
  `   }}\n` +
  `3) Then a single-line JSON object:\n` +
  `   {"_assessment": {\n` +
  `     "sufficient": <bool>,\n` +
  `     "missing": [<legacy field keys — keep for back-compat: "location"|"named_person"|"scope"|"specific_details">],\n` +
  `     "missingByComponent": [ {"componentId": <id>, "requiredFields": [<field>], "disambiguation": [<dimension>]} ],\n` +
  `     "topQuestions": [<up to 3 short Hebrew questions — each aimed at a specific gap, and briefly explaining WHY>]\n` +
  `   }}\n\n` +
  `QUESTION QUALITY RULES:\n` +
  `- Do not suggest interpretations in the question ("האם זה חוסר אמון?"). Instead, offer the officer a\n` +
  `  constrained menu ("האם הגורם הדומיננטי הוא עייפות, חוסר אמון באיום, קושי גישה, או אחר?").\n` +
  `- Prefer questions that distinguish among resilience components (fatigue vs. distrust vs. access,\n` +
  `  compliance erosion vs. trust erosion, continuity disruption cause).\n` +
  `- Never ask something the officer already answered across prior turns.\n` +
  `- Keep each question to one sentence.\n\n`;

function applyContentKindStableAdjustments(stable, contentKind) {
  if (contentKind === 'audio') {
    return stable.replace(
      'Extract ATOMIC signals',
      'Extract ATOMIC signals from spoken-audio transcripts (same rules as news text)',
    );
  }
  if (contentKind === 'field_report') {
    return stable.replace(
      'Extract ATOMIC signals',
      'Extract ATOMIC signals from expert field report documents (same signal vocabulary)',
    );
  }
  if (contentKind === 'whatsapp_realtime') {
    return stable.replace(
      'Extract ATOMIC signals',
      'Extract ATOMIC signals from a single WhatsApp field report',
    );
  }
  if (contentKind === 'whatsapp_interactive') {
    return stable.replace(
      'Extract ATOMIC signals',
      'Extract ATOMIC signals from a multi-turn WhatsApp officer dialogue',
    );
  }
  return stable;
}

function buildExtractionContentKindPrefix(contentKind) {
  if (contentKind === 'audio') return AUDIO_SIGNAL_EXTRACTION_PREFIX;
  if (contentKind === 'field_report') return FIELD_REPORT_SIGNAL_EXTRACTION_PREFIX;
  if (contentKind === 'whatsapp_realtime') return WHATSAPP_REALTIME_SIGNAL_EXTRACTION_PREFIX;
  if (contentKind === 'whatsapp_interactive') return WHATSAPP_INTERACTIVE_SIGNAL_EXTRACTION_PREFIX;
  return '';
}

export function buildExtractionSystemForCall(contentKind, domainGroupKey = null) {
  const parts = buildExtractionSystemParts(contentKind, {
    formatDisambiguationBlock,
    formatSignalCatalog: formatSignalCatalogForPrompt,
    contentKindPrefix: buildExtractionContentKindPrefix(contentKind),
    passScopeSuffix: domainGroupKey ? buildPassScopeSuffix(domainGroupKey) : '',
  });
  return {
    stable: applyContentKindStableAdjustments(parts.stable, contentKind),
    dynamic: parts.dynamic,
  };
}

export function buildSignalExtractionSystemPrompt(contentKind) {
  const parts = buildExtractionSystemForCall(contentKind, null);
  return `${parts.dynamic}${parts.stable}`;
}

function extractUserLabelForSignals(contentKind) {
  if (contentKind === 'audio') return 'spoken-audio transcript segments';
  if (contentKind === 'field_report') return 'expert field report documents';
  return 'news articles';
}
function haikuRetryWaitMs(err, attempt) {
  const is429 = err.message?.includes('429') || err.status === 429;
  return is429 ? 90000 : 5000 * attempt;
}

async function fetchHaikuSignalsOnce(batchLabel, modelId, system, userContent, usageCallback, callContextExtra = {}) {
  const llmPort = getDefaultLlmPort();
  const maxTokens = extractMaxTokens();
  const stream = await Promise.resolve(llmPort.stream({
    model: modelId,
    max_tokens: maxTokens,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: userContent }],
    callContext: {
      feature: 'extract',
      promptId: EXTRACT_PROMPT_ID,
      promptVersion: EXTRACT_PROMPT_VERSION,
      purpose: batchLabel,
      maxOutputTokens: maxTokens,
      ...callContextExtra,
    },
    onUsage: usageCallback
      ? (p) => usageCallback({ label: batchLabel, model: modelId, usage: p.usage })
      : undefined,
  }));
  await streamWithProgress(stream, batchLabel);
  const message = await stream.finalMessage();
  if (message.stop_reason === 'max_tokens') {
    console.error('  ⚠ batch hit max_tokens — attempting partial recovery');
  }
  console.error(`  → stop_reason: ${message.stop_reason}`);
  if (usageCallback) usageCallback({ label: batchLabel, model: modelId, usage: message.usage });
  const textBlock = message.content.find((b) => b.type === 'text');
  if (!textBlock) throw new Error(`${batchLabel}: no text block`);
  const signals = extractJsonArray(textBlock.text);
  if (!Array.isArray(signals)) throw new Error(`${batchLabel}: expected JSON array`);
  const rejected = extractRationaleEnabled() ? parseRejectedCandidates(textBlock.text) : [];
  return { signals, rejected };
}

async function fetchMissArticlesSignals({
  missArticles, origIndexByMiss, articles, batchLabel, retries, usageCallback,
  contentKind, domainGroupKey, modelId, extractOpts,
}) {
  const system = buildExtractionSystemForCall(contentKind, domainGroupKey);
  const prepared = await prepareArticlesForPrompt(missArticles, {
    contentKind,
    domainGroupKey,
    retrievalService: extractOpts.retrievalService ?? null,
    reportDate: extractOpts.reportDate ?? null,
  });
  const userContent =
    `Extract all behavioral signals from these Israeli ${extractUserLabelForSignals(contentKind)}:\n\n` +
    formatArticlesForPrompt(prepared);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const label = attempt > 1 ? `${batchLabel} (retry ${attempt})` : batchLabel;
      const { signals: raw, rejected } = await fetchHaikuSignalsOnce(label, modelId, system, userContent, usageCallback);
      const llmSignals = remapMissBatchIndices(raw, origIndexByMiss);
      persistArticleExtractCache(llmSignals, articles, {
        model: modelId,
        contentKind,
        domainGroupKey,
        cacheDbPath: extractOpts.cacheDbPath,
      });
      if (extractOpts.trace?.enabled && rejected.length) {
        extractOpts.trace.event('rejected', { batch: batchLabel, items: rejected });
      }
      return llmSignals;
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = haikuRetryWaitMs(err, attempt);
      console.error(`  ⚠ ${batchLabel} attempt ${attempt} failed (${err.message}) — retrying in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return [];
}

async function callHaikuExtraction(articles, {
  batchLabel,
  retries,
  usageCallback,
  contentKind,
  domainGroupKey = null,
  extractModel = null,
  extractOpts = {},
}) {
  const modelId = extractModel ?? DEFAULT_EXTRACT_MODEL;
  const { missArticles, origIndexByMiss, cachedSignals } = partitionArticlesByExtractCache(
    articles,
    {
      model: modelId,
      contentKind,
      domainGroupKey,
      cacheDbPath: extractOpts.cacheDbPath,
    },
  );

  if (cachedSignals.length > 0) {
    console.error(`  → ${batchLabel}: ${cachedSignals.length} cached signal(s) from ${articles.length - missArticles.length} article(s)`);
  }

  const llmSignals = missArticles.length > 0
    ? await fetchMissArticlesSignals({
      missArticles, origIndexByMiss, articles, batchLabel, retries, usageCallback,
      contentKind, domainGroupKey, modelId, extractOpts,
    })
    : [];

  return [...cachedSignals.map((s) => ({ ...s, _from_cache: true })), ...llmSignals];
}

/**
 * Closed-vocab self-check (E5): asks Haiku whether each candidate signal is a
 * correct instance of its declared signal_type. Drops verdict==="no".
 * Returns the surviving signals (uncertain & yes are kept).
 */
function collectSelfCheckVerdicts(verdicts) {
  const noSet = new Set();
  const uncertainSet = new Set();
  const reasonCounts = {};
  const reasonByIndex = new Map();
  for (const v of verdicts) {
    const idx = Number(v.index);
    if (!Number.isInteger(idx)) continue;
    const verdict = String(v.verdict ?? '').toLowerCase();
    if (verdict === 'no') {
      noSet.add(idx);
      const reason = typeof v.reason === 'string' && v.reason ? v.reason : 'unspecified';
      reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      reasonByIndex.set(idx, reason);
    } else if (verdict === 'uncertain') {
      uncertainSet.add(idx);
    }
  }
  return { noSet, uncertainSet, reasonCounts, reasonByIndex };
}

function reportSelfCheckStats(batchLabel, usageCallback, stats) {
  if (!usageCallback) return;
  usageCallback({ label: `${batchLabel} self-check`, stage: 'self_check', stats });
}

function applySelfCheckVerdicts(signals, verdicts, batchLabel, usageCallback) {
  const { noSet, uncertainSet, reasonCounts, reasonByIndex } = collectSelfCheckVerdicts(verdicts);
  for (const idx of uncertainSet) {
    if (signals[idx]) {
      logSelfCheckUncertain(signals[idx], batchLabel);
      signals[idx]._self_check = { verdict: 'uncertain' };
    }
  }
  for (const idx of noSet) {
    if (signals[idx]) {
      signals[idx]._dropped_reason = { stage: 'self_check', reason: reasonByIndex.get(idx) ?? 'unspecified' };
    }
  }
  if (noSet.size === 0) {
    reportSelfCheckStats(batchLabel, usageCallback, {
      kept: signals.length, dropped: 0, input: signals.length, reason_counts: {},
    });
    return signals;
  }
  const survivors = signals.filter((_, i) => !noSet.has(i));
  console.error(`  → [${batchLabel}] self-check dropped ${noSet.size}/${signals.length} signal(s)`);
  reportSelfCheckStats(batchLabel, usageCallback, {
    kept: survivors.length, dropped: noSet.size, input: signals.length, reason_counts: reasonCounts,
  });
  return survivors;
}

async function runSelfCheck(signals, batchLabel, usageCallback) {
  if (!signals.length) return signals;
  const { system, user, indices } = buildSelfCheckPrompt(signals);

  try {
    const selfLabel = `${batchLabel} self-check`;
    const selfCheckMax = Math.min(selfCheckMaxTokensCap(), 60 + indices.length * 30);
    const llmPort = getDefaultLlmPort();
    const stream = await Promise.resolve(llmPort.stream({
      model: DEFAULT_SELF_CHECK_MODEL,
      max_tokens: selfCheckMax,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
      callContext: {
        feature: 'extract_self_check',
        promptId: EXTRACT_PROMPT_ID,
        promptVersion: EXTRACT_PROMPT_VERSION,
        purpose: selfLabel,
        maxOutputTokens: selfCheckMax,
      },
      onUsage: usageCallback
        ? (p) => usageCallback({ label: selfLabel, model: DEFAULT_SELF_CHECK_MODEL, usage: p.usage })
        : undefined,
    }));
    await streamWithProgress(stream, selfLabel);
    const message = await stream.finalMessage();
    if (usageCallback) usageCallback({ label: selfLabel, model: DEFAULT_SELF_CHECK_MODEL, usage: message.usage });
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock) return signals;
    const verdicts = extractJsonArray(textBlock.text);
    if (!Array.isArray(verdicts)) return signals;
    return applySelfCheckVerdicts(signals, verdicts, batchLabel, usageCallback);
  } catch (err) {
    console.error(`  ⚠ ${batchLabel} self-check failed (${err.message}) — keeping all signals`);
    return signals;
  }
}

async function buildMultipassBatchCall(articles, batchLabel, key, modelId, contentKind, extractOpts) {
  const passLabel = `${batchLabel} pass-${key}`;
  const { missArticles, origIndexByMiss, cachedSignals } = partitionArticlesByExtractCache(
    articles,
    { model: modelId, contentKind, domainGroupKey: key, cacheDbPath: extractOpts.cacheDbPath },
  );
  if (!missArticles.length) return { cachedSignals, batchCall: null };
  const system = buildExtractionSystemForCall(contentKind, key);
  const prepared = await prepareArticlesForPrompt(missArticles, {
    contentKind,
    domainGroupKey: key,
    retrievalService: extractOpts.retrievalService ?? null,
    reportDate: extractOpts.reportDate ?? null,
  });
  const userContent =
    `Extract all behavioral signals from these Israeli ${extractUserLabelForSignals(contentKind)}:\n\n` +
    formatArticlesForPrompt(prepared);
  return {
    cachedSignals,
    batchCall: {
      customId: passLabel,
      model: modelId,
      system,
      userContent,
      label: passLabel,
      meta: { key, origIndexByMiss, missArticles },
    },
  };
}

async function processBatchCallResult(call, result, articles, raw, {
  retries, usageCallback, contentKind, extractModel, extractOpts, modelId,
}) {
  if (!result?.ok) {
    console.error(`  ⚠ batch pass failed (${result?.error}) — sync fallback for ${call.customId}`);
    const fallback = await callHaikuExtraction(articles, {
      batchLabel: call.customId,
      retries,
      usageCallback,
      contentKind,
      domainGroupKey: call.meta.key,
      extractModel,
      extractOpts,
    });
    for (const s of fallback) s._pass = call.meta.key;
    return raw.concat(fallback);
  }
  if (usageCallback && result.usage) {
    usageCallback({ label: call.label, model: modelId, usage: result.usage });
  }
  const remapped = remapMissBatchIndices(result.signals, call.meta.origIndexByMiss);
  for (const s of remapped) s._pass = call.meta.key;
  persistArticleExtractCache(remapped, articles, {
    model: modelId,
    contentKind,
    domainGroupKey: call.meta.key,
    cacheDbPath: extractOpts.cacheDbPath,
  });
  console.error(`  → ${call.customId}: ${remapped.length} candidate(s) [batch]`);
  return raw.concat(remapped);
}

async function extractMultipassViaBatch({
  articles, batchLabel, retries, usageCallback, contentKind, extractModel, extractOpts, groupKeys, modelId,
}) {
  const batchCalls = [];
  const cachedAccum = [];
  for (const key of groupKeys) {
    const { cachedSignals, batchCall } = await buildMultipassBatchCall(
      articles, batchLabel, key, modelId, contentKind, extractOpts,
    );
    cachedAccum.push(...cachedSignals.map((s) => ({ ...s, _pass: key, _from_cache: true })));
    if (batchCall) batchCalls.push(batchCall);
  }
  if (batchCalls.length === 0) return cachedAccum;

  const batchResults = await runExtractionBatchCalls(batchCalls);
  let raw = [...cachedAccum];
  for (const call of batchCalls) {
    raw = await processBatchCallResult(call, batchResults.get(call.customId), articles, raw, {
      retries, usageCallback, contentKind, extractModel, extractOpts, modelId,
    });
  }
  return raw;
}

async function extractMultipassSequential({
  articles, batchLabel, retries, usageCallback, contentKind, extractModel, extractOpts, groupKeys,
}) {
  let raw = [];
  for (const key of groupKeys) {
    const passLabel = `${batchLabel} pass-${key}`;
    const passSignals = await callHaikuExtraction(articles, {
      batchLabel: passLabel,
      retries,
      usageCallback,
      contentKind,
      domainGroupKey: key,
      extractModel,
      extractOpts,
    });
    for (const s of passSignals) if (s._pass == null) s._pass = key;
    console.error(`  → ${passLabel}: ${passSignals.length} candidate(s)`);
    raw = raw.concat(passSignals);
  }
  return raw;
}

async function extractMultipassRaw(articles, batchLabel, retries, usageCallback, contentKind, extractModel, extractOpts) {
  const groupKeys = getMultipassGroupKeys();
  const modelId = extractModel ?? DEFAULT_EXTRACT_MODEL;
  const passCtx = {
    articles, batchLabel, retries, usageCallback, contentKind, extractModel, extractOpts, groupKeys,
  };

  if (extractBatchEnabled() && groupKeys.length > 0) {
    return extractMultipassViaBatch({ ...passCtx, modelId });
  }

  return extractMultipassSequential(passCtx);
}

async function extractSignalsBatch(articles, batchLabel, retries = 3, usageCallback = null, contentKind = 'news', extractModel = null, extractOpts = {}) {
  const useMultipass = isMultipassEnabled() &&
    contentKind !== 'whatsapp_realtime' &&
    contentKind !== 'whatsapp_interactive';

  let raw = useMultipass
    ? await extractMultipassRaw(articles, batchLabel, retries, usageCallback, contentKind, extractModel, extractOpts)
    : await callHaikuExtraction(articles, {
      batchLabel,
      retries,
      usageCallback,
      contentKind,
      extractModel,
      extractOpts,
    });

  // Snapshot the model's raw candidates (pre-dedup) so the decision trace can
  // attribute each candidate's fate to the stage that dropped it.
  const traceActive = extractOpts.trace?.enabled === true;
  const traceCandidates = traceActive ? raw.slice() : null;

  const beforeDedup = raw.length;
  raw = dedupeSignalsWithinBatch(raw);
  if (raw.length < beforeDedup) {
    console.error(`  → [${batchLabel}] in-batch dedup: ${beforeDedup} → ${raw.length}`);
  }
  const afterInBatch = traceActive ? new Set(raw.map(signalTraceKey)) : null;

  const beforeSemantic = raw.length;
  raw = await dedupeSignalsBySemanticEvidence(raw, { contentKind });
  if (raw.length < beforeSemantic) {
    console.error(`  → [${batchLabel}] semantic dedup: ${beforeSemantic} → ${raw.length}`);
  }
  const afterSemantic = traceActive ? new Set(raw.map(signalTraceKey)) : null;

  let valid = validateSignalsFromCall(raw, articles, batchLabel, contentKind);
  const afterValidate = traceActive ? new Set(valid.map(signalTraceKey)) : null;
  valid = await applyEvidenceVerifier(valid, articles, batchLabel, usageCallback);
  const afterVerifier = traceActive ? new Set(valid.map(signalTraceKey)) : null;
  valid = await runSelfCheck(valid, batchLabel, usageCallback);
  const afterSelfCheck = traceActive ? new Set(valid.map(signalTraceKey)) : null;
  await captureBatchLearningSignals(articles, valid, batchLabel, usageCallback);

  if (traceActive) {
    emitBatchTrace({
      trace: extractOpts.trace,
      articles,
      contentKind,
      batchLabel,
      candidates: traceCandidates,
      sets: { afterInBatch, afterSemantic, afterValidate, afterVerifier, afterSelfCheck },
    });
  }
  return valid;
}

function signalExtractionConfidence(s) {
  return typeof s.extraction_confidence === 'number' ? s.extraction_confidence : 0.85;
}

function absorbSemanticDuplicate(kept, keepVecs, i, candidate, vec) {
  const incumbent = kept[i];
  if (signalExtractionConfidence(candidate) > signalExtractionConfidence(incumbent)) {
    candidate._semantic_dedup_count = (incumbent._semantic_dedup_count ?? 1) + 1;
    kept[i] = candidate;
    keepVecs[i] = vec;
  } else {
    incumbent._semantic_dedup_count = (incumbent._semantic_dedup_count ?? 1) + 1;
  }
}

async function dedupeOneTypeList(list, threshold, model) {
  if (list.length === 1) return list;
  const kept = [];
  const keepVecs = [];
  for (const s of list) {
    const ev = String(s?.evidence ?? '').trim();
    if (!ev) {
      kept.push(s);
      keepVecs.push(null);
      continue;
    }
    const v = await embedCached(ev, model);
    let merged = false;
    for (let i = 0; i < kept.length; i++) {
      if (!keepVecs[i]) continue;
      if (cosine(v, keepVecs[i]) >= threshold) {
        absorbSemanticDuplicate(kept, keepVecs, i, s, v);
        merged = true;
        break;
      }
    }
    if (!merged) {
      kept.push(s);
      keepVecs.push(v);
    }
  }
  return kept;
}

function semanticDedupSkipped(contentKind, signals) {
  if (process.env.RESILIENCE_SEMANTIC_DEDUP === '0') return true;
  if (!embeddingsEnabled()) return true;
  if (contentKind === 'whatsapp_realtime' || contentKind === 'whatsapp_interactive') return true;
  return !Array.isArray(signals) || signals.length < 2;
}

async function dedupeSignalsBySemanticEvidence(signals, { contentKind = 'news' } = {}) {
  if (semanticDedupSkipped(contentKind, signals)) return signals;

  const thr = Number.parseFloat(process.env.RESILIENCE_SEMANTIC_DEDUP_THRESHOLD ?? '0.92');
  const threshold = Number.isFinite(thr) ? Math.min(0.999, Math.max(0.5, thr)) : 0.92;
  const model = embeddingModelId();
  const byType = new Map();
  for (const s of signals) {
    const t = String(s?.signal_type ?? '').trim() || '_';
    if (!byType.has(t)) byType.set(t, []);
    byType.get(t).push(s);
  }

  const survivors = [];
  for (const [, list] of byType.entries()) {
    survivors.push(...await dedupeOneTypeList(list, threshold, model));
  }
  return survivors;
}

/**
 * Step 1: Extract behavioral signals from articles.
 * Signals use a closed vocabulary; their mapping to components is done by code in behaviorSignals.js.
 *
 * @param {Array} articles   Flat array from loadMdFiles()
 * @returns {Array}          Signal objects: { article_index, article_url, signal_type, evidence_class, scope_level, confidence, evidence }
 */
async function extractSignalsInBatches(batches, onUsage, onProgress, contentKind, extractModel, extractOpts = {}) {
  console.error(`  → splitting into ${batches.length} batches of ≤${EVIDENCE_BATCH_SIZE}`);
  let allSignals = [];
  for (let i = 0; i < batches.length; i++) {
    if (i > 0) {
      console.error(`  → waiting ${BATCH_DELAY_MS / 1000}s between batches...`);
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
    }
    onProgress?.({
      type: 'progress',
      step: 'extract',
      message: `Extracting signals (batch ${i + 1}/${batches.length})...`,
    });
    const label = `[Step 1 — batch ${i + 1}/${batches.length}]`;
    const signals = await extractSignalsBatch(batches[i], label, 3, onUsage, contentKind, extractModel, extractOpts);
    console.error(`  → ${signals.length} signals from batch ${i + 1}`);
    allSignals = allSignals.concat(signals);
  }
  return allSignals;
}

export async function extractSignals(articles, {
  onUsage,
  onProgress,
  contentKind = 'news',
  extractModel = null,
  retrievalService = null,
  reportDate = null,
  trace = null,
} = {}) {
  const extractOpts = { retrievalService, reportDate, trace };
  if (articles.length <= EVIDENCE_BATCH_SIZE) {
    onProgress?.({ type: 'progress', step: 'extract', message: 'Extracting behavioral signals...' });
    return extractSignalsBatch(articles, '[Step 1 — Signal extraction]', 3, onUsage, contentKind, extractModel, extractOpts);
  }

  const batches = [];
  for (let i = 0; i < articles.length; i += EVIDENCE_BATCH_SIZE) {
    batches.push(articles.slice(i, i + EVIDENCE_BATCH_SIZE));
  }
  return extractSignalsInBatches(batches, onUsage, onProgress, contentKind, extractModel, extractOpts);
}

export {DOMAIN_INTENT_QUERIES} from '../../../cross-cut-modules/retrieval/domainIntentQueries.js';