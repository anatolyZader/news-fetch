/**
 * Two-step LLM evaluation using Claude API:
 *   Step 1 — Signal extraction: Haiku extracts typed behavioral signals (closed vocabulary).
 *             Code deterministically maps signals → component scores (no LLM scoring).
 *   Step 2 — Narrative generation: Sonnet writes component narratives based on the signals.
 *             Scoring is handled by scoreComponents() in behaviorSignals.js.
 */

import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import { RESILIENCE_COMPONENTS } from '../domain/resilienceComponents.js';
import {
  SIGNAL_TYPES,
  summarizeConfidence,
  overallScore,
  scoreComponents,
  AFFECTED_SUBGROUPS,
  AFFECTED_SYSTEMS,
  INTENSITY_LEVELS,
  PHASE_LEVELS,
  POLARITY_OVERRIDE_SIGNAL_TYPES,
  AFFECTED_SYSTEM_SIGNAL_TYPES,
} from '../domain/services/behaviorSignals.js';
import { computeNorrisCapacities } from '../domain/services/norrisCapacities.js';
import { narrativeIncludesScores } from '../domain/services/assessmentDisplayTier.js';
import { bufferOovCapture, LEARNING_CAPTURE_KINDS } from '../domain/services/oovCapture.js';
import { parseFieldReportTitleLocality } from '../../../cross-cut-modules/geo/localityCandidate.js';
import {
  DOMAIN_GROUPS,
  isMultipassEnabled,
  buildDomainScopeSuffix,
  buildSelfCheckPrompt,
} from './extractionPasses.js';
import {
  formatSignalCatalog,
  formatDisambiguationBlock,
} from '../domain/services/signalCatalogPrompt.js';
import {
  verifyEvidenceAgainstArticle,
  dedupeSignalsWithinBatch,
  tokenize,
} from './signalVerification.js';
import { maybeRescueEvidenceWithEmbedding } from './embeddingEvidenceVerifier.js';
import { embedText, embeddingsEnabled, embeddingModelId } from '../../../cross-cut-modules/vector_index/index.js';
import { createHash } from 'node:crypto';
import {
  captureBatchLearningSignals,
  logSelfCheckUncertain,
} from './learningCapture.js';

const client = new Anthropic(); // uses ANTHROPIC_API_KEY from env

// Model IDs are env-overridable so deprecations can be rolled out without code edits.
// Defaults match the launched models as of writing; override with
// RESILIENCE_EXTRACT_MODEL / RESILIENCE_SELF_CHECK_MODEL / RESILIENCE_NARRATIVE_MODEL.
const DEFAULT_EXTRACT_MODEL = process.env.RESILIENCE_EXTRACT_MODEL ?? 'claude-haiku-4-5-20251001';
const DEFAULT_SELF_CHECK_MODEL = process.env.RESILIENCE_SELF_CHECK_MODEL ?? 'claude-haiku-4-5-20251001';
const DEFAULT_NARRATIVE_MODEL = process.env.RESILIENCE_NARRATIVE_MODEL ?? 'claude-sonnet-4-6';

// ─── Signal catalog formatter (re-exported from domain) ─────────────────────

function formatSignalCatalogForPrompt() {
  return formatSignalCatalog();
}

// ─── JSON extraction helpers ──────────────────────────────────────────────────

export function extractJsonArray(text) {
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
  const raw = fenced ? fenced[1].trim() : (() => {
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
      if (end > start) return text.slice(start, end + 1);
    }
    return text.trim();
  })();

  try {
    return JSON.parse(raw);
  } catch {
    // Attempt repair for malformed JSON (unescaped chars, truncated arrays, etc.)
    console.error('  ⚠ JSON.parse failed — attempting jsonrepair');
    return JSON.parse(jsonrepair(raw));
  }
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

function formatArticlesForPrompt(preparedArticles) {
  return preparedArticles
    .map(
      (a, i) =>
        `### [${i + 1}] ${a.title}\n` +
        `Source: ${a.source} | Published: ${a.publishedAt}\n` +
        `URL: ${a.url || '(no url)'}\n\n` +
        (a.promptBody || extractTopKParagraphsByRelevance(a.body, 6) || '(no body text)'),
    )
    .join('\n\n---\n\n');
}

const DOMAIN_INTENT_QUERIES = Object.freeze({
  // Keep these short and behavior-focused; they’re only used to retrieve relevant spans.
  A: 'civilian protective behavior: shelter use, compliance with instructions, evacuation, injuries, risk, alerts',
  B: 'institutional response: guidance and communication, service continuity/disruption (schools, hospitals, transport), leadership actions',
  C: 'social fabric & wellbeing: volunteering, mutual aid, solidarity, morale/narratives, resources/shortages, mental health, vulnerable groups',
});

const SEMANTIC_SELECT_CACHE = new Map(); // key -> Float32Array

function sha256Hex(s) {
  return createHash('sha256').update(String(s ?? '')).digest('hex');
}

function semanticSelectionEnabled() {
  if (process.env.RESILIENCE_SEMANTIC_SPAN_SELECTION === '0') return false;
  return embeddingsEnabled();
}

function splitParagraphs(body) {
  const raw = String(body ?? '');
  const paras = raw.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  // Merge tiny paragraphs so we don’t embed 100 one-liners.
  const merged = [];
  let buf = '';
  for (const p of paras) {
    if (!buf) {
      buf = p;
      continue;
    }
    if (buf.length < 180) {
      buf += ' ' + p;
    } else {
      merged.push(buf);
      buf = p;
    }
  }
  if (buf) merged.push(buf);
  return merged;
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

  const topK = scored
    .sort((a, b) => b.score - a.score || a.idx - b.idx)
    .slice(0, k)
    .sort((a, b) => a.idx - b.idx);

  return topK.map((x) => x.p).join('\n\n');
}

async function prepareArticlesForPrompt(articles, { contentKind = 'news', domainGroupKey = null } = {}) {
  const useSemantic = semanticSelectionEnabled() && contentKind !== 'whatsapp_realtime' && contentKind !== 'whatsapp_interactive';
  const out = [];
  for (const a of articles) {
    let promptBody = '';
    if (useSemantic) {
      try {
        promptBody = await extractTopKParagraphsBySemanticRelevance(a.body, domainGroupKey, 6);
      } catch {
        promptBody = '';
      }
    }
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
  `⚠ Field reports are dense — each community paragraph often contains 5-15 distinct facts spanning multiple\n` +
  `  resilience domains (leadership, services, protection, wellbeing, community capital, etc.).\n` +
  `  You MUST split every distinct fact into its own signal. Do NOT collapse a paragraph into one or two\n` +
  `  summary signals. Walk through each clause/phrase and ask: what signal type does THIS fact belong to?\n` +
  `  Example: "צח״י active; donation received; informal activity for children; call to social services"\n` +
  `  → 4 separate signals: leadership_visible_presence + community_volunteering, resource_mobilization,\n` +
  `    service_continuity, wellbeing_support_accessed.\n\n`;

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
  `  ⚠ fear_expression / calm_confidence: this type ONLY — individual emotions require a named subject.\n` +
  `  ⚠ resilience_narrative_positive / resilience_narrative_negative: also accept "observational_reported_fact"\n` +
  `     when a host, reporter, or caller characterises collective mood or community-wide narrative\n` +
  `     (e.g. "people in our region say they won't leave", "the spirit in the north has broken down").\n` +
  `     The evidence text MUST contain mood/spirit/coping-identity language — not just condition descriptions.\n` +
  `     REJECT: field-observer summaries or abstract labels ("overall resilience present", "strong settlement",\n` +
  `     "population coping", "community functioning"). Split into specific factual signal types or discard.\n` +
  `     REJECT: descriptions of services or frameworks ("protected space for children", "employment program").\n` +
  `     These are service_continuity or service_disruption, not narrative signals.\n\n` +

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
  `   A single quote may yield multiple signals if it contains multiple distinct facts. Extract each separately.\n` +
  `   Example: "I rushed to find my children; on the way I saw injured neighbors" → two signals:\n` +
  `     (a) evacuation/family reunification → compliance_enter_shelter or lifesaving_behavior domain\n` +
  `     (b) witnessing injured population → harm_to_population\n` +
  `   Do NOT collapse this into one solidarity signal just because neighbors are mentioned.\n` +
  `2. CLOSED VOCABULARY: You MUST choose signal type from the list below. Never invent new types.\n` +
  `3. DO NOT EXTRACT: political/military/diplomatic content — unless it contains a direct civilian behavioral response.\n` +
  `   This includes: political punditry, ideological debates, democratic discourse, comparisons to other countries'\n` +
  `   political systems (e.g. Hungary, Poland), coalition politics, constitutional debates, party strategy analysis.\n` +
  `   These are NOT resilience signals even if they mention "anxiety" or "concern" — general political worry is\n` +
  `   not crisis-coping behavior. Only extract when civilians describe how the emergency/war directly affects\n` +
  `   their daily life, safety, services, or ability to cope.\n` +
  `   SCOPE: We measure resilience of the Israeli civilian population in the context of EMERGENCY/WAR ONLY.\n` +
  `   Do NOT extract signals about: enemy combatants, foreign populations, military personnel morale/behavior\n` +
  `   in operational theatres, or general peacetime political/social discourse unrelated to the crisis.\n` +
  `   ⚠ MILITARY EVENTS & PERSONNEL IN OPERATIONAL THEATRES — DO NOT EXTRACT:\n` +
  `     ALL of the following are OUT OF SCOPE and must NOT produce any signal:\n` +
  `     • IDF soldiers wounded, injured, or killed in operational/combat theatres (Lebanon, Gaza, Syria, etc.)\n` +
  `       — including named fallen soldiers, Paratroopers/reserve casualties, drone/rocket wounds to troops,\n` +
  `       battalion commander injuries during combat.\n` +
  `     • Comrade eulogies / testimonials by fellow soldiers about a fallen soldier ("he was the spirit of\n` +
  `       our company", "he always volunteered first") — this is intra-military remembrance, not civilian\n` +
  `       resilience. Do NOT classify as solidarity_help_others or resilience_narrative_*.\n` +
  `     • Soldier reflections, philosophical statements, or mutual-support quotes from within operational\n` +
  `       units ("we must watch over each other", "who is protecting whom") — military personnel morale is\n` +
  `       out of scope regardless of sentiment.\n` +
  `     • Military unit activities, operational briefings, personnel decisions, appointments, internal\n` +
  `       military debates about strategy or organization.\n` +
  `     EXCEPTION: extract ONLY when the article reports a direct CIVILIAN reaction INSIDE ISRAEL — e.g. a\n` +
  `     named bereaved family member (mother, sibling, spouse — not fellow soldiers) expressing grief/coping,\n` +
  `     a community's solidarity response to a fallen soldier from their town, civilians attending a funeral.\n` +
  `     Even then, classify the signal by the civilian behavior (solidarity_help_others, psychological_distress,\n` +
  `     resilience_narrative_*) — not by the military event itself. A quote from a comrade is NOT a civilian reaction.\n` +
  `   GEOGRAPHIC SCOPE: Only extract signals about people INSIDE ISRAEL. Skip diaspora events, antisemitism\n` +
  `   abroad, Jewish community life in other countries, and solidarity visits from foreign delegations —\n` +
  `   unless the article describes the direct impact on Israeli civilians (e.g. returning evacuees).\n` +
  `   Diaspora Ministry reports about antisemitism in Australia, Europe, US, etc. → DO NOT EXTRACT.\n` +
  `   Holocaust-survivor speeches at state ceremonies → extract only if they characterise current Israeli\n` +
  `   community coping (resilience_narrative_*); not for historical references.\n` +
  `4. DO NOT EXTRACT: global indices, international rankings, or pre-crisis baseline surveys.\n` +
  `5. NON-EMERGENCY CIVILIAN HARM — DO NOT EXTRACT as harm_to_population:\n` +
  `   harm_to_population is for CIVILIAN harm CAUSED BY THE WAR/EMERGENCY (rocket/missile/drone strikes on\n` +
  `   civilian areas, terror attacks on civilians, shrapnel injuries from Hezbollah/Hamas/Iranian fire).\n` +
  `   DO NOT EXTRACT the following as harm_to_population or any resilience signal:\n` +
  `     • Traffic accidents (car crashes, motorcyclist killed by stolen car, multi-vehicle collisions)\n` +
  `     • Hiking/nature accidents (cliff falls, drowning, lost hikers, rescue of yeshiva students)\n` +
  `     • Medical incidents unrelated to attack (brain hemorrhage on vacation, food poisoning, routine births)\n` +
  `     • Off-duty domestic crime/violence (off-duty soldier fare dispute, civilian assaults, burglary)\n` +
  `     • Ordinary hospital operations (births, non-emergency admissions) unless hospital was struck or overloaded\n` +
  `     These are not war-caused civilian harm and do not measure community resilience to the emergency.\n` +
  `   ACCEPT as harm_to_population: "61-year-old injured by shrapnel in Tamra from Hezbollah rocket barrage";\n` +
  `     "civilian in his 80s rescued from rubble after Iranian missile strike on Haifa"; "Gershowitz family\n` +
  `     members killed in missile strike". These are direct war-caused civilian harm.\n\n` +

  `━━━ CLASSIFICATION BOUNDARIES (read before choosing signal type) ━━━\n` +
  `${formatDisambiguationBlock()}\n` +
  `Supplemental rules (cross-cutting, not duplicated in catalog metadata above):\n` +
  `- community_volunteering: organized or spontaneous volunteering (distinct from one-off solidarity_help_others).\n` +
  `- psychological_distress vs fear_expression vs child_distress: PTSD/chronic grief → psychological_distress;\n` +
  `  situational safety fear → fear_expression; children-specific symptoms → child_distress.\n` +
  `- population_survey_finding: named survey/institutional measured finding (use evidence_type named_survey_statistic).\n` +
  `- self_evacuation_unauthorized vs evacuation_displacement: residents leave without official order vs institutional evacuation.\n` +
  `- early_warning_system_* vs information_*: siren/app/HFC timing failures or successes → preparedness domain types.\n` +
  `- connectivity_outage: telecom/internet/mobile failure (set affected_system: telecom when applicable).\n` +
  `- STATE ADMINISTRATIVE CONTINUITY → service_continuity; ACTIVE AID MOBILIZATION → resource_mobilization.\n` +
  `- COMMERCIAL TRANSPORT suspensions/resumptions → service_disruption / service_continuity.\n` +
  `- צח"י: extract leadership_visible_presence/absence AND community_volunteering/resource_shortage when mentioned.\n` +
  `- system_overload vs resource_shortage: overloaded capacity vs absent supplies.\n` +
  `- trust types (interpersonal/institutional/media/inter_group): use polarity_override negative when evidence shows erosion.\n` +
  `- domestic_violence_indicator / suicide_self_harm_indicator: explicit reported fact only — never infer.\n` +
  `- FIELD REPORTS: classify observable facts; resilience_narrative_* only when quoting residents' collective story.\n\n` +

  `━━━ SIGNAL TYPES (closed vocabulary) ━━━\n` +
  `${formatSignalCatalogForPrompt()}\n\n` +

  `━━━ SCOPE LEVEL (choose one — rates evidence breadth, not emotional vividness) ━━━\n` +
  `"single_case"          — a single behavioral instance or quote from one actor\n` +
  `"repeated_pattern"     — more than one instance, or article explicitly describes recurrence or a pattern\n` +
  `"quantified_or_broad"  — a count, percentage, named survey result, or institutional action with system-wide scope\n\n` +

  `━━━ INFORMATIVE ABSENCE (rare; cap 3 per batch) ━━━\n` +
  `Most signals must come from explicit text. EXCEPTION: when an article reports a routine state\n` +
  `that, given the emergency context, is itself a behavioral fact (e.g. "school year started normally\n` +
  `in Kiryat Shmona this morning" → routine_maintenance / service_continuity). In that case, set\n` +
  `evidence_basis = "inferred_absence" so the evidence verifier knows not to expect a direct quote.\n` +
  `Limit yourself to at most 3 inferred-absence signals across the entire batch — they are weak\n` +
  `evidence and should not dominate.\n\n` +

  `━━━ OPTIONAL INSTANCE FIELDS (omit when not applicable) ━━━\n` +
  `  "intensity": "light" | "moderate" | "severe" — severity of this instance (default moderate if omitted)\n` +
  `  "phase": "anticipation" | "response" | "recovery" — event timeline phase\n` +
  `  "affected_subgroup": one of [${AFFECTED_SUBGROUPS.join(', ')}] — when equity/disparity targets a subgroup\n` +
  `  "affected_system": one of [${AFFECTED_SYSTEMS.join(', ')}] — ONLY for: ${[...AFFECTED_SYSTEM_SIGNAL_TYPES].join(', ')}\n` +
  `  "polarity_override": "positive" | "negative" — ONLY for: ${[...POLARITY_OVERRIDE_SIGNAL_TYPES].join(', ')}\n` +
  `    when context clearly reverses the default reading\n\n` +

  `━━━ OUTPUT SCHEMA ━━━\n` +
  `For each behavioral signal found, output a JSON object:\n` +
  `{\n` +
  `  "article_index": <N from [N]>,\n` +
  `  "article_url": "<URL from the article header, or null>",\n` +
  `  "signal_type": "<one type from the closed vocabulary above>",\n` +
  `  "evidence_type": "direct_quote_named_person" | "named_survey_statistic" | "named_institutional_fact" | "observational_reported_fact",\n` +
  `  "evidence": "<exact quote or bare factual description — no journalist adjectives, max 300 chars>",\n` +
  `  "scope_level": "single_case" | "repeated_pattern" | "quantified_or_broad",\n` +
  `  "evidence_basis": "present_in_text" | "paraphrased" | "inferred_absence",\n` +
  `  "extraction_confidence": <number 0.0-1.0>,\n` +
  `  "intensity": "light" | "moderate" | "severe" (optional),\n` +
  `  "phase": "anticipation" | "response" | "recovery" (optional),\n` +
  `  "affected_subgroup": "<enum>" (optional),\n` +
  `  "affected_system": "<enum>" (optional, continuity signals only),\n` +
  `  "polarity_override": "positive" | "negative" (optional, whitelist only)\n` +
  `}\n\n` +
  `Return ONLY a valid JSON array. One article can yield multiple signals. Skip articles with no extractable behavioral evidence.`;

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

export function buildSignalExtractionSystemPrompt(contentKind) {
  const base = SIGNAL_EXTRACTION_SYSTEM_PROMPT;
  if (contentKind === 'audio') {
    return AUDIO_SIGNAL_EXTRACTION_PREFIX + base.replace(
      'from news articles using',
      'from spoken-audio transcripts (same rules as news text) using',
    );
  }
  if (contentKind === 'field_report') {
    return FIELD_REPORT_SIGNAL_EXTRACTION_PREFIX + base.replace(
      'from news articles using',
      'from expert field report documents (same signal vocabulary) using',
    );
  }
  if (contentKind === 'whatsapp_realtime') {
    return WHATSAPP_REALTIME_SIGNAL_EXTRACTION_PREFIX + base.replace(
      'from news articles using',
      'from a single WhatsApp field report using',
    );
  }
  if (contentKind === 'whatsapp_interactive') {
    return WHATSAPP_INTERACTIVE_SIGNAL_EXTRACTION_PREFIX + base.replace(
      'from news articles using',
      'from a multi-turn WhatsApp officer dialogue using',
    );
  }
  return base;
}

function extractUserLabelForSignals(contentKind) {
  if (contentKind === 'audio') return 'spoken-audio transcript segments';
  if (contentKind === 'field_report') return 'expert field report documents';
  return 'news articles';
}

/**
 * Validates and normalises the signals array returned by a single Haiku call.
 * Drops unknown signal types, normalises evidence_type, drops named-emotional
 * signals without a named person, and clamps extraction_confidence into [0,1].
 */
function validateSignalsFromCall(signals, articles, sourceLabel) {
  const validTypes = new Set(SIGNAL_TYPES);
  const validEvidenceTypes = new Set([
    'direct_quote_named_person', 'named_survey_statistic',
    'named_institutional_fact', 'observational_reported_fact',
  ]);
  const validBasis = new Set(['present_in_text', 'paraphrased', 'inferred_absence']);
  const INDIVIDUAL_EMOTIONAL_SIGNAL_TYPES = new Set(['fear_expression', 'calm_confidence', 'child_distress']);
  const validIntensity = new Set(INTENSITY_LEVELS);
  const validPhase = new Set(PHASE_LEVELS);
  const validSubgroup = new Set(AFFECTED_SUBGROUPS);
  const validAffectedSystem = new Set(AFFECTED_SYSTEMS);

  const valid = signals.filter((s) => {
    if (!s || typeof s !== 'object') return false;
    if (!validTypes.has(s.signal_type)) {
      console.error(`  ⚠ [${sourceLabel}] Dropped unknown signal type: "${s.signal_type}"`);
      bufferOovCapture({
        capture_kind: LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
        suggested_type: s.signal_type,
        evidence: s.evidence ?? null,
        source_label: sourceLabel,
        article_index: s.article_index ?? null,
        timestamp: new Date().toISOString(),
      });
      return false;
    }
    if (!validEvidenceTypes.has(s.evidence_type)) {
      s.evidence_type = 'observational_reported_fact';
    }
    if (!validBasis.has(s.evidence_basis)) {
      s.evidence_basis = 'present_in_text';
    }
    if (INDIVIDUAL_EMOTIONAL_SIGNAL_TYPES.has(s.signal_type) &&
        s.evidence_type === 'observational_reported_fact') {
      console.error(`  ⚠ [${sourceLabel}] Dropped emotional signal without named-person evidence: "${s.signal_type}"`);
      return false;
    }
    if (typeof s.extraction_confidence !== 'number' ||
        Number.isNaN(s.extraction_confidence)) {
      s.extraction_confidence = 0.85;
    } else {
      s.extraction_confidence = Math.min(1, Math.max(0, s.extraction_confidence));
    }
    if (s.intensity != null && !validIntensity.has(s.intensity)) delete s.intensity;
    if (s.phase != null && !validPhase.has(s.phase)) delete s.phase;
    if (s.affected_subgroup != null && !validSubgroup.has(s.affected_subgroup)) {
      delete s.affected_subgroup;
    }
    if (s.affected_system != null) {
      if (!AFFECTED_SYSTEM_SIGNAL_TYPES.has(s.signal_type) || !validAffectedSystem.has(s.affected_system)) {
        delete s.affected_system;
      }
    }
    if (s.polarity_override != null) {
      if (!POLARITY_OVERRIDE_SIGNAL_TYPES.has(s.signal_type) ||
          (s.polarity_override !== 'positive' && s.polarity_override !== 'negative')) {
        delete s.polarity_override;
      }
    }
    return true;
  });

  for (const s of valid) {
    const art = articles[s.article_index - 1];
    if (art) {
      s.article_source = art.source;
      s.temporal_weight = art.temporal_weight ?? 1.0;
      if (art.title) {
        s.article_title = art.title;
        if (contentKind === 'field_report') {
          const municipality = parseFieldReportTitleLocality(art.title);
          if (municipality) s.municipality = municipality;
        }
      }
    }
  }

  return valid;
}

/**
 * Verifies each signal's evidence against its source article body using
 * Jaccard shingle similarity. Drops signals that fail the type-specific
 * threshold. Logs the drop reason for auditability.
 */
async function applyEvidenceVerifier(signals, articles, sourceLabel, usageCallback = null) {
  const verified = [];
  const borderline = [];
  let dropped = 0;
  // C9: track per-reason kill counts so the cost log can show whether the
  // verifier earns its complexity. Reasons come from verifyEvidenceAgainstArticle
  // (e.g. "low_jaccard", "no_overlap"); embedding-rescue success is implicit.
  const reasonCounts = {};
  for (const s of signals) {
    const art = articles[s.article_index - 1];
    const result = verifyEvidenceAgainstArticle(s, art?.body);
    if (result.ok) {
      verified.push(s);
      continue;
    }
    const emb = await maybeRescueEvidenceWithEmbedding(s, art?.body, result);
    if (emb.ok) {
      verified.push(s);
      continue;
    }
    if (shouldQueueEntailmentCheck(s, result, art?.body)) {
      borderline.push({ s, artBody: art?.body ?? '', primary: result });
      continue;
    }
    dropped++;
    reasonCounts[result.reason] = (reasonCounts[result.reason] || 0) + 1;
    const evPreview = (s.evidence ?? '').slice(0, 80).replace(/\s+/g, ' ');
    console.error(
      `  ⚠ [${sourceLabel}] Dropped unverifiable evidence ` +
      `(${result.reason}${result.sim != null ? `, sim=${result.sim.toFixed(2)}` : ''}): ` +
      `[${s.signal_type}] "${evPreview}…"`,
    );
  }

  if (borderline.length > 0) {
    const kept = await runEntailmentVerifier(borderline, sourceLabel, usageCallback);
    for (const item of kept) verified.push(item);
    // Count the remaining borderline as dropped (for auditability).
    const droppedByEntailment = borderline.length - kept.length;
    if (droppedByEntailment > 0) {
      dropped += droppedByEntailment;
      reasonCounts.entailment_reject = (reasonCounts.entailment_reject || 0) + droppedByEntailment;
    }
  }

  if (dropped > 0) {
    console.error(`  → [${sourceLabel}] verifier dropped ${dropped}/${signals.length} signal(s)`);
  }
  if (usageCallback) {
    usageCallback({
      label: `${sourceLabel} verifier`,
      stage: 'evidence_verifier',
      stats: {
        kept: verified.length,
        dropped,
        input: signals.length,
        reason_counts: reasonCounts,
      },
    });
  }
  return verified;
}

function shouldQueueEntailmentCheck(signal, primaryResult, articleBody) {
  if (process.env.RESILIENCE_NLI_VERIFY === '0') return false;
  if (!articleBody || typeof articleBody !== 'string' || articleBody.trim().length < 80) return false;
  if (primaryResult?.reason !== 'low_similarity') return false;
  const sim = primaryResult?.sim;
  if (typeof sim !== 'number' || Number.isNaN(sim)) return false;
  // Only run NLI on borderline cases; very low similarity is likely hallucinated or off-topic.
  const evidenceType = signal?.evidence_type ?? 'observational_reported_fact';
  const thresholds = {
    direct_quote_named_person: 0.70,
    named_survey_statistic: 0.50,
    named_institutional_fact: 0.50,
    observational_reported_fact: 0.40,
  };
  const t = thresholds[evidenceType] ?? 0.40;
  const low = Number.parseFloat(process.env.RESILIENCE_NLI_BORDERLINE_LOW ?? String(t * 0.65));
  const borderlineLow = Number.isFinite(low) ? Math.max(0.05, Math.min(t - 0.01, low)) : t * 0.65;
  return sim >= borderlineLow && sim < t;
}

function bestMatchingSnippet(evidence, body, maxChars = 1400) {
  const evTokens = tokenize(evidence);
  if (!evTokens.length) return body.slice(0, maxChars);
  const evSet = new Set(evTokens);
  const paragraphs = splitParagraphs(body);
  if (!paragraphs.length) return body.slice(0, maxChars);
  let best = { score: -1, text: paragraphs[0] };
  for (const p of paragraphs.slice(0, 36)) {
    const toks = tokenize(p);
    if (!toks.length) continue;
    let hits = 0;
    for (const t of toks) if (evSet.has(t)) hits++;
    const score = hits / Math.sqrt(toks.length);
    if (score > best.score) best = { score, text: p };
  }
  const snippet = best.text.trim();
  return snippet.length > maxChars ? `${snippet.slice(0, maxChars)}...` : snippet;
}

async function runEntailmentVerifier(borderlineItems, sourceLabel, usageCallback) {
  if (process.env.RESILIENCE_NLI_VERIFY === '0') return [];
  if (!borderlineItems.length) return [];

  const maxItems = Math.max(0, Math.min(30, Number.parseInt(process.env.RESILIENCE_NLI_MAX_ITEMS ?? '18', 10) || 18));
  const items = borderlineItems.slice(0, maxItems);

  const model = process.env.RESILIENCE_NLI_MODEL ?? DEFAULT_SELF_CHECK_MODEL;
  const system =
    `You are an entailment verifier.\n` +
    `Given a PREMISE excerpt and a HYPOTHESIS statement, decide whether the premise entails the hypothesis.\n` +
    `Output JSON array of {"i":N,"verdict":"entails"|"neutral"|"contradicts"}.\n` +
    `Be conservative: if the premise does not clearly support the hypothesis, choose "neutral".\n` +
    `Do not use outside knowledge.\n`;

  const lines = items.map((it, i) => {
    const ev = String(it.s?.evidence ?? '').trim().slice(0, 320);
    const premise = bestMatchingSnippet(ev, it.artBody, 1400);
    return (
      `CASE ${i}\n` +
      `signal_type: ${it.s?.signal_type ?? 'unknown'}\n` +
      `evidence_type: ${it.s?.evidence_type ?? 'unknown'}\n` +
      `PREMISE:\n${premise}\n\n` +
      `HYPOTHESIS:\n${ev}\n`
    );
  }).join('\n\n---\n\n');

  const user =
    `Evaluate these cases:\n\n${lines}\n\n` +
    `Return only the JSON array.`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: Math.min(2500, 200 + items.length * 60),
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    const text = textBlock ? textBlock.text : '';
    const verdicts = extractJsonArray(text);
    const keep = new Set();
    if (Array.isArray(verdicts)) {
      for (const v of verdicts) {
        const idx = Number(v?.i);
        const verdict = String(v?.verdict ?? '').toLowerCase();
        if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) continue;
        if (verdict === 'entails') keep.add(idx);
      }
    }
    const kept = [];
    for (let i = 0; i < items.length; i++) {
      if (keep.has(i)) kept.push(items[i].s);
      else {
        const evPreview = String(items[i].s?.evidence ?? '').slice(0, 80).replace(/\s+/g, ' ');
        console.error(`  ⚠ [${sourceLabel}] Dropped by entailment gate: [${items[i].s?.signal_type}] "${evPreview}…"`);
      }
    }
    if (usageCallback) {
      usageCallback({
        label: `${sourceLabel} entailment`,
        stage: 'entailment_verifier',
        model,
        stats: { kept: kept.length, dropped: items.length - kept.length, input: items.length },
      });
    }
    return kept;
  } catch (err) {
    console.error(`  ⚠ [${sourceLabel}] entailment verifier failed (${err.message}) — keeping borderline signals`);
    return items.map((x) => x.s);
  }
}

async function callHaikuExtraction(articles, batchLabel, retries, usageCallback, contentKind, domainGroupKey, extractModel) {
  const baseSystem = buildSignalExtractionSystemPrompt(contentKind);
  const system = domainGroupKey
    ? `${baseSystem}\n\n${buildDomainScopeSuffix(domainGroupKey)}`
    : baseSystem;
  const prepared = await prepareArticlesForPrompt(articles, { contentKind, domainGroupKey });
  const userContent =
    `Extract all behavioral signals from these Israeli ${extractUserLabelForSignals(contentKind)}:\n\n` +
    formatArticlesForPrompt(prepared);

  const modelId = extractModel ?? DEFAULT_EXTRACT_MODEL;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const stream = client.messages.stream({
        model: modelId,
        max_tokens: 12000,
        temperature: 0,
        system,
        messages: [{ role: 'user', content: userContent }],
      });

      const label = attempt > 1 ? `${batchLabel} (retry ${attempt})` : batchLabel;
      await streamWithProgress(stream, label);

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
      return signals;
    } catch (err) {
      if (attempt === retries) throw err;
      const is429 = err.message?.includes('429') || err.status === 429;
      const wait = is429 ? 90000 : 5000 * attempt;
      console.error(`  ⚠ ${batchLabel} attempt ${attempt} failed (${err.message}) — retrying in ${wait / 1000}s...`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  return [];
}

/**
 * Closed-vocab self-check (E5): asks Haiku whether each candidate signal is a
 * correct instance of its declared signal_type. Drops verdict==="no".
 * Returns the surviving signals (uncertain & yes are kept).
 */
async function runSelfCheck(signals, batchLabel, usageCallback) {
  if (!signals.length) return signals;
  const { system, user, indices } = buildSelfCheckPrompt(signals);

  try {
    const stream = client.messages.stream({
      model: DEFAULT_SELF_CHECK_MODEL,
      max_tokens: Math.min(4000, 60 + indices.length * 30),
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const selfLabel = `${batchLabel} self-check`;
    await streamWithProgress(stream, selfLabel);
    const message = await stream.finalMessage();
    if (usageCallback) usageCallback({ label: selfLabel, model: DEFAULT_SELF_CHECK_MODEL, usage: message.usage });
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock) return signals;
    const verdicts = extractJsonArray(textBlock.text);
    if (!Array.isArray(verdicts)) return signals;
    const noSet = new Set();
    const uncertainSet = new Set();
    const reasonCounts = {};
    for (const v of verdicts) {
      const idx = Number(v.index);
      if (!Number.isInteger(idx)) continue;
      const verdict = String(v.verdict ?? '').toLowerCase();
      if (verdict === 'no') {
        noSet.add(idx);
        const reason = typeof v.reason === 'string' && v.reason ? v.reason : 'unspecified';
        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
      } else if (verdict === 'uncertain') {
        uncertainSet.add(idx);
      }
    }
    for (const idx of uncertainSet) {
      if (signals[idx]) logSelfCheckUncertain(signals[idx], batchLabel);
    }
    if (noSet.size === 0) {
      // C9: still emit a stats event so we know the self-check ran but kept all.
      if (usageCallback) {
        usageCallback({
          label: `${batchLabel} self-check`,
          stage: 'self_check',
          stats: { kept: signals.length, dropped: 0, input: signals.length, reason_counts: {} },
        });
      }
      return signals;
    }
    const survivors = signals.filter((_, i) => !noSet.has(i));
    console.error(`  → [${batchLabel}] self-check dropped ${noSet.size}/${signals.length} signal(s)`);
    if (usageCallback) {
      usageCallback({
        label: `${batchLabel} self-check`,
        stage: 'self_check',
        stats: {
          kept: survivors.length,
          dropped: noSet.size,
          input: signals.length,
          reason_counts: reasonCounts,
        },
      });
    }
    return survivors;
  } catch (err) {
    console.error(`  ⚠ ${batchLabel} self-check failed (${err.message}) — keeping all signals`);
    return signals;
  }
}

async function extractSignalsBatch(articles, batchLabel, retries = 3, usageCallback = null, contentKind = 'news', extractModel = null) {
  const useMultipass = isMultipassEnabled() &&
    contentKind !== 'whatsapp_realtime' &&
    contentKind !== 'whatsapp_interactive';

  let raw = [];
  if (useMultipass) {
    const groupKeys = Object.keys(DOMAIN_GROUPS);
    for (const key of groupKeys) {
      const passLabel = `${batchLabel} pass-${key}`;
      const passSignals = await callHaikuExtraction(
        articles, passLabel, retries, usageCallback, contentKind, key, extractModel,
      );
      console.error(`  → ${passLabel}: ${passSignals.length} candidate(s)`);
      raw = raw.concat(passSignals);
    }
  } else {
    raw = await callHaikuExtraction(articles, batchLabel, retries, usageCallback, contentKind, null, extractModel);
  }

  const beforeDedup = raw.length;
  raw = dedupeSignalsWithinBatch(raw);
  if (raw.length < beforeDedup) {
    console.error(`  → [${batchLabel}] in-batch dedup: ${beforeDedup} → ${raw.length}`);
  }

  const beforeSemantic = raw.length;
  raw = await dedupeSignalsBySemanticEvidence(raw, { contentKind });
  if (raw.length < beforeSemantic) {
    console.error(`  → [${batchLabel}] semantic dedup: ${beforeSemantic} → ${raw.length}`);
  }

  let valid = validateSignalsFromCall(raw, articles, batchLabel);
  valid = await applyEvidenceVerifier(valid, articles, batchLabel, usageCallback);
  valid = await runSelfCheck(valid, batchLabel, usageCallback);
  await captureBatchLearningSignals(articles, valid, batchLabel, usageCallback);
  return valid;
}

async function dedupeSignalsBySemanticEvidence(signals, { contentKind = 'news' } = {}) {
  if (process.env.RESILIENCE_SEMANTIC_DEDUP === '0') return signals;
  if (!embeddingsEnabled()) return signals;
  // WhatsApp messages are already tiny; don’t spend embeddings here.
  if (contentKind === 'whatsapp_realtime' || contentKind === 'whatsapp_interactive') return signals;
  if (!Array.isArray(signals) || signals.length < 2) return signals;

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
    if (list.length === 1) {
      survivors.push(list[0]);
      continue;
    }
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
        const sim = cosine(v, keepVecs[i]);
        if (sim >= threshold) {
          // Keep the higher-confidence representative; preserve a small provenance hint.
          const a = kept[i];
          const aConf = typeof a.extraction_confidence === 'number' ? a.extraction_confidence : 0.85;
          const bConf = typeof s.extraction_confidence === 'number' ? s.extraction_confidence : 0.85;
          if (bConf > aConf) {
            s._semantic_dedup_count = (a._semantic_dedup_count ?? 1) + 1;
            kept[i] = s;
            keepVecs[i] = v;
          } else {
            a._semantic_dedup_count = (a._semantic_dedup_count ?? 1) + 1;
          }
          merged = true;
          break;
        }
      }
      if (!merged) {
        kept.push(s);
        keepVecs.push(v);
      }
    }

    survivors.push(...kept);
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
export async function extractSignals(articles, { onUsage, onProgress, contentKind = 'news', extractModel = null } = {}) {
  if (articles.length <= EVIDENCE_BATCH_SIZE) {
    onProgress?.({ type: 'progress', step: 'extract', message: 'Extracting behavioral signals...' });
    return extractSignalsBatch(articles, '[Step 1 — Signal extraction]', 3, onUsage, contentKind, extractModel);
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
    const signals = await extractSignalsBatch(batches[i], label, 3, onUsage, contentKind, extractModel);
    console.error(`  → ${signals.length} signals from batch ${i + 1}`);
    allSignals = allSignals.concat(signals);
  }
  return allSignals;
}

// Backwards-compat alias
export { extractSignals as extractEvidence };

// ─── Step 2: Narrative generation ─────────────────────────────────────────────

function narrativeInstrumentLine(scored, totalArticles) {
  if (!scored || scored.score == null && scored.confidence === 'insufficient_data') {
    return 'Instrument: insufficient data';
  }
  const certaintyPct = scored.certainty != null
    ? `${(scored.certainty * 100).toFixed(0)}%`
    : 'n/a';
  const dir = scored.strength != null
    ? (scored.strength >= 0 ? 'net_positive' : 'net_negative')
    : 'unknown';
  const mass = scored.evidence_mass ?? 0;
  const suff = mass < 1.5 ? 'thin' : mass < 4 ? 'moderate' : 'adequate';
  const polTag = scored.polarization != null && scored.polarization > 0.5 && mass > 4
    ? '  contested'
    : '';
  const deltaTag = scored.delta_flag === 'significant' ? '  SIGNIFICANT_vs_baseline' : '';
  const floorTag = scored.floor_clamped ? '  thin_evidence_floor' : '';
  return (
    `Instrument: certainty=${certaintyPct}  direction=${dir}  evidence_sufficiency=${suff}` +
    `  (${scored.distinct_article_count ?? 0}/${totalArticles} articles, ${scored.signal_count ?? 0} signals)` +
    `${polTag}${deltaTag}${floorTag}`
  );
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
    const signals = (scored?.signals ?? []).map((s) => {
      const fd = s.signal_file_date ? `  Source bundle date: ${s.signal_file_date}\n` : '';
      return (
        `  [${s.signal_type}] (scope:${s.scope_level ?? 'single_case'}, ev:${s.evidence_type ?? 'unknown'}, conf:${(s.extraction_confidence ?? 1).toFixed(2)})\n` +
        `${fd}  Evidence: "${s.evidence}"${s.article_url ? `\n  URL: ${s.article_url}` : ''}`
      );
    }).join('\n');

    let metricsSummary;
    if (includeScores) {
      const ciTag = scored?.score_low != null && scored?.score_high != null
        ? `  CI: ${scored.score_low}-${scored.score_high}` : '';
      const polTag = scored?.polarization != null && scored.polarization > 0.5 && scored.evidence_mass > 4
        ? `  ⚠ contested (pol=${scored.polarization.toFixed(2)})`
        : scored?.polarization != null && scored.polarization > 0.5
          && scored.evidence_mass >= 1.5 && scored.evidence_mass < 4
          ? `  ⚠ contested_thin (pol=${scored.polarization.toFixed(2)}, mass=${scored.evidence_mass})`
          : '';
      const suppressTag = scored?.suppression_delta != null && Math.abs(scored.suppression_delta) >= 1
        ? `  suppression: raw=${scored.score_raw ?? scored.score} headline=${scored.score_headline ?? scored.score} (Δ=${scored.suppression_delta})`
        : '';
      const mediaTag = scored?.media_mention_mass != null && scored.media_mention_mass > 0
        ? `  press_mention_mass=${scored.media_mention_mass}`
        : '';
      const deltaTag = scored?.delta_score != null
        ? `  Δvs prev: ${scored.delta_score >= 0 ? '+' : ''}${scored.delta_score}` +
          (scored.delta_significance != null ? ` (z=${scored.delta_significance.toFixed(1)})` : '') +
          (scored.delta_flag === 'significant' ? ' SIGNIFICANT' : '')
        : '';
      metricsSummary = scored?.score != null
        ? `Score: ${scored.score}/10  Certainty: ${(scored.certainty * 100).toFixed(0)}%  Direction: ${scored.strength >= 0 ? '+' : ''}${scored.strength.toFixed(2)}  (${scored.distinct_article_count}/${totalArticles} articles, ${(scored.coverage_ratio * 100).toFixed(1)}%, ${scored.dispersion} dispersion)  +ev:${scored.positive_evidence} −ev:${scored.negative_evidence}${ciTag}${polTag}${suppressTag}${mediaTag}${deltaTag}`
        : 'Score: insufficient data';
    } else {
      metricsSummary = narrativeInstrumentLine(scored, totalArticles);
    }

    return (
      `**${compDef.id}** — ${compDef.name_en}\n` +
      `Confidence: ${conf}  ${metricsSummary}\n` +
      `Behavioral manifestations:\n${compDef.behavioral_manifestations?.map((m, i) => `  ${i + 1}. ${m}`).join('\n') ?? '(none defined)'}\n` +
      `Signals extracted (${scored?.signal_count ?? 0}):\n${signals || '  (none)'}`
    );
  }).join('\n\n---\n\n');
}

function priorComponentTrendTags(c) {
  const tags = [`confidence=${c.confidence ?? 'n/a'}`];
  if (c.delta_flag === 'significant') {
    const dir = (c.delta_score ?? 0) > 0 ? 'up' : (c.delta_score ?? 0) < 0 ? 'down' : 'shift';
    tags.push(`significant_delta_${dir}`);
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
  const scopeContext = reportScope?.id === 'north'
    ? `━━━ REPORT SCOPE: NORTHERN ISRAEL ━━━\n` +
      `Write this assessment as a northern-region report, focused on civilians and communities in northern Israel. ` +
      `Use national context only as comparison. Be explicit when evidence is from a sub-region such as Naftali and avoid generalizing it to the whole north.\n\n`
    : '';

  const groundingContext =
    `━━━ GROUND TRUTH & DATE DISCIPLINE ━━━\n` +
    `Assessment anchor date for this JSON output: ${date}.\n` +
    `- The "Signals extracted" Evidence blocks ARE the allowable facts for TODAY's behavior picture. Treat each bundle-date line (when shown) as the dated provenance for that excerpt.\n` +
    `- cross_component_synthesis and every component narrative must only assert situations that fair readers could trace back to TODAY's Evidence text. You may add trend phrases using PRIOR DAYS' CONTEXT only when explicitly comparing score trajectories—never as a source of new factual events.\n` +
    `- Do not use independent world knowledge of Israel/Lebanon, military operations, treaties, diplomacy, or ceasefires—even if widely known or plausible.\n` +
    `- Do not state timelines (e.g. "at midnight", "entered into force", "day N of truce") unless that exact timetable or factual claim appears inside the Evidence strings you rely on.\n` +
    `- If evidence records expectations, rumours, or reported statements, phrase them strictly as attributed communications or observed reporting—never as externally verified geopolitical facts.\n` +
    `- When evidence conflicts, surface the conflict; do not resolve it from outside facts.\n\n`;

  const dataVoidContext = dataVoid?.level && dataVoid.level !== 'none'
    ? `━━━ DATA VOID / DIGITAL DARKNESS ━━━\n` +
      `Critical sampling gap detected (level=${dataVoid.level}, digital_darkness=${dataVoid.digital_darkness === true}).\n` +
      `You MUST NOT describe the situation as stable or calm due to lack of reports.\n` +
      `Lead with a warning that evidence is critically insufficient and may reflect connectivity failure.\n\n`
    : '';

  const systemPrompt =
    `You are a community resilience analyst writing behavioral narratives for a structured report.\n` +
    (includeScoresInPrompt
      ? `The component SCORES are already computed — do not re-score. Your job is to write clear, behavioral narratives.\n\n`
      : `Component instrument tags (certainty, direction, sufficiency) are pre-computed — do not invent numeric 1–10 ratings. Your job is to write clear, behavioral narratives grounded in Evidence lines.\n\n`) +
    scopeContext +
    dataVoidContext +
    formatMacroSignalsContext(macroSignals) +
    (contentKind === 'audio' ? AUDIO_NARRATIVE_CONTEXT : '') +
    (sourceTypes.has('field') ? FIELD_REPORT_NARRATIVE_CONTEXT : '') +
    (sourceTypes.has('naftali') ? NAFTALI_NARRATIVE_CONTEXT : '') +
    (priorContext ? priorContext : '') +
    (comparisonContext ? comparisonContext : '') +
    groundingContext +

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
    `- THIN EVIDENCE / ABSTENTION: When instrument tags include thin_evidence_floor, limited_evidence_neutral, or unverified_alert, do NOT use stability language ("calm", "stable", "normal"). For unverified_alert, lead with "a single unverified report suggests…" and recommend corroboration.\n` +
    `- SUPPRESSION: When suppression_delta is large (|Δ|≥1), note that raw signal stream differed from the headline-adjusted assessment and explain why (e.g. single-source concentration).\n` +
    `- SCOPE DISCIPLINE: Never use "the only", "the one exception", "uniquely", or similar exclusive claims.\n` +
    `  The inputs are a sample, not a census. Something appearing once in the data means it was reported once — not that it is the sole instance.\n` +
    `- LINKS: Each signal has a URL. When a signal has a URL, embed a markdown link for every significant claim:\n` +
    `    In narrative: append ([source](URL)) after the relevant sentence\n` +
    `    In evidence items: append ([source](URL)) at end of the item\n` +
    `    If a signal has no URL, omit the link — do not fabricate URLs\n\n` +

    `━━━ THE 8 COMPONENTS (with pre-computed ${includeScoresInPrompt ? 'scores' : 'instrument tags'} and signals) ━━━\n\n` +
    `${formatScoredComponentsForNarrative(scoredComponents, totalArticles, { includeScores: includeScoresInPrompt })}\n\n` +

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
    `}`;

  const userContent =
    `Assessment anchor date: ${date}\nTotal articles counted for coverage: ${totalArticles}\n\n` +
    `Write behavioral narratives for all 8 components based on the signals above. Facts must trace to Evidence text in this payload only.\n`;

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

      // Merge narratives into scored components to produce final assessment
      const componentMap = Object.fromEntries(
        (narratives.components ?? []).map((c) => [c.component_id, c])
      );

      const components = RESILIENCE_COMPONENTS.map((def) => {
        const scored = scoredComponents[def.id] ?? {};
        const narr = componentMap[def.id] ?? {};
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
          type_diversity_factor:   scored.type_diversity_factor ?? 0,
          signal_type_entropy:     scored.signal_type_entropy ?? 0,
          positive_evidence: scored.positive_evidence ?? 0,
          negative_evidence: scored.negative_evidence ?? 0,
          net_evidence: scored.net_evidence ?? 0,
          evidence_mass: scored.evidence_mass ?? 0,
          strength: scored.strength ?? 0,
          adjusted_strength: scored.adjusted_strength ?? 0,
          certainty: scored.certainty ?? 0,
          polarization: scored.polarization ?? 0,
          score_low:    scored.score_low ?? null,
          score_high:   scored.score_high ?? null,
          counterfactual_article_key: scored.counterfactual_article_key ?? null,
          counterfactual_delta:       scored.counterfactual_delta ?? null,
          counterfactual_no_caps:     scored.counterfactual_no_caps ?? scored.score_raw ?? null,
          score_smoothed:     scored.score_smoothed ?? null,
          delta_score:        scored.delta_score ?? null,
          delta_significance: scored.delta_significance ?? null,
          delta_flag:         scored.delta_flag ?? null,
          floor_clamped:      scored.floor_clamped === true,
          ci_unstable:        scored.ci_unstable === true,
          source_cap_binding: scored.source_cap_binding === true,
          derived_indicators: scored.derived_indicators ?? null,
          score_raw:          scored.score_raw ?? null,
          score_headline:     scored.score_headline ?? scored.score ?? null,
          suppression_delta:  scored.suppression_delta ?? null,
          delta_chronic:        scored.delta_chronic ?? null,
          z_score_chronic:      scored.z_score_chronic ?? null,
          erosion_index:        scored.erosion_index ?? null,
          exhaustion_days:      scored.exhaustion_days ?? null,
          cumulative_deficit:   scored.cumulative_deficit ?? null,
          media_mention_mass:   scored.media_mention_mass ?? null,
          suppression_breakdown: scored.suppression_breakdown ?? null,
          facets:             scored.facets ?? null,
          // N9 explainability:
          top_contributors: ((scored.signals ?? [])
            .filter((s) => typeof s._contribution === 'number')
            .sort((a, b) => Math.abs(b._contribution) - Math.abs(a._contribution))
            .slice(0, 10)
            .map((s) => ({
              signal_type:    s.signal_type ?? s.type ?? null,
              source_type:    s.source_type ?? null,
              article_source: s.article_source ?? null,
              article_url:    s.article_url ?? null,
              evidence:       s.evidence ?? null,
              _contribution:  s._contribution,
              _contribution_pre_cap: s._contribution_pre_cap ?? null,
              _contribution_raw: s._contribution_raw ?? null,
              _cap_scale_factor: s._cap_scale_factor ?? null,
              _cap_layer: s._cap_layer ?? null,
              _weight:        s._weight,
              _polarity:      s._polarity,
            }))),
          manifestations_evidenced: narr.manifestations_evidenced ?? [],
          manifestations_absent: narr.manifestations_absent ?? [],
          evidence: narr.evidence ?? [],
          narrative: narr.narrative ?? '',
        };
      });

      return {
        date,
        ...(reportScope ? { report_scope: reportScope } : {}),
        total_articles_analyzed: totalArticles,
        overall_resilience_score: overallScore(scoredComponents),
        content_kind: contentKind,
        cross_component_synthesis: narratives.cross_component_synthesis ?? '',
        evidence_quality_note: narratives.evidence_quality_note ?? '',
        norris_capacities: computeNorrisCapacities(scoredComponents, scoredComponents),
        components,
        ...(macroSignals?.length ? { macro_signals: macroSignals.slice(0, 50) } : {}),
        ...(dataVoid ? { data_void: dataVoid } : {}),
        ...(oovCaptureCount > 0 ? { oov_capture_count: oovCaptureCount } : {}),
        ...(allScopedSignals ? { scoped_signal_count: allScopedSignals.length } : {}),
      };
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
