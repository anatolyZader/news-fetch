import Anthropic from '@anthropic-ai/sdk';
import { createHash } from 'node:crypto';
import {
  AFFECTED_SUBGROUPS,
  AFFECTED_SYSTEMS,
  POLARITY_OVERRIDE_SIGNAL_TYPES,
  AFFECTED_SYSTEM_SIGNAL_TYPES,
} from '../domain/services/behaviorSignals.js';
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
import { dedupeSignalsWithinBatch } from './signalVerification.js';
import { embedText, embeddingsEnabled, embeddingModelId } from '../../../cross-cut-modules/vector_index/index.js';
import {
  captureBatchLearningSignals,
  logSelfCheckUncertain,
} from './learningCapture.js';
import { extractJsonArray } from './claudeJsonHelpers.js';
import { validateSignalsFromCall } from './claudeSignalValidation.js';
import { applyEvidenceVerifier, splitParagraphs } from './claudeEvidenceVerification.js';

const client = new Anthropic();
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
  `  "extraction_confidence": <number 0-1>,\n` +
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
function haikuRetryWaitMs(err, attempt) {
  const is429 = err.message?.includes('429') || err.status === 429;
  return is429 ? 90000 : 5000 * attempt;
}

async function fetchHaikuSignalsOnce(batchLabel, modelId, system, userContent, usageCallback) {
  const stream = client.messages.stream({
    model: modelId,
    max_tokens: 12000,
    temperature: 0,
    system,
    messages: [{ role: 'user', content: userContent }],
  });
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
  return signals;
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
      const label = attempt > 1 ? `${batchLabel} (retry ${attempt})` : batchLabel;
      return await fetchHaikuSignalsOnce(label, modelId, system, userContent, usageCallback);
    } catch (err) {
      if (attempt === retries) throw err;
      const wait = haikuRetryWaitMs(err, attempt);
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
function collectSelfCheckVerdicts(verdicts) {
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
  return { noSet, uncertainSet, reasonCounts };
}

function reportSelfCheckStats(batchLabel, usageCallback, stats) {
  if (!usageCallback) return;
  usageCallback({ label: `${batchLabel} self-check`, stage: 'self_check', stats });
}

async function runSelfCheck(signals, batchLabel, usageCallback) {
  if (!signals.length) return signals;
  const { system, user, indices } = buildSelfCheckPrompt(signals);

  try {
    const selfLabel = `${batchLabel} self-check`;
    const stream = client.messages.stream({
      model: DEFAULT_SELF_CHECK_MODEL,
      max_tokens: Math.min(4000, 60 + indices.length * 30),
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    await streamWithProgress(stream, selfLabel);
    const message = await stream.finalMessage();
    if (usageCallback) usageCallback({ label: selfLabel, model: DEFAULT_SELF_CHECK_MODEL, usage: message.usage });
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock) return signals;
    const verdicts = extractJsonArray(textBlock.text);
    if (!Array.isArray(verdicts)) return signals;

    const { noSet, uncertainSet, reasonCounts } = collectSelfCheckVerdicts(verdicts);
    for (const idx of uncertainSet) {
      if (signals[idx]) logSelfCheckUncertain(signals[idx], batchLabel);
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

  let valid = validateSignalsFromCall(raw, articles, batchLabel, contentKind);
  valid = await applyEvidenceVerifier(valid, articles, batchLabel, usageCallback);
  valid = await runSelfCheck(valid, batchLabel, usageCallback);
  await captureBatchLearningSignals(articles, valid, batchLabel, usageCallback);
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
async function extractSignalsInBatches(batches, onUsage, onProgress, contentKind, extractModel) {
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
    const signals = await extractSignalsBatch(batches[i], label, 3, onUsage, contentKind, extractModel);
    console.error(`  → ${signals.length} signals from batch ${i + 1}`);
    allSignals = allSignals.concat(signals);
  }
  return allSignals;
}

export async function extractSignals(articles, { onUsage, onProgress, contentKind = 'news', extractModel = null } = {}) {
  if (articles.length <= EVIDENCE_BATCH_SIZE) {
    onProgress?.({ type: 'progress', step: 'extract', message: 'Extracting behavioral signals...' });
    return extractSignalsBatch(articles, '[Step 1 — Signal extraction]', 3, onUsage, contentKind, extractModel);
  }

  const batches = [];
  for (let i = 0; i < articles.length; i += EVIDENCE_BATCH_SIZE) {
    batches.push(articles.slice(i, i + EVIDENCE_BATCH_SIZE));
  }
  return extractSignalsInBatches(batches, onUsage, onProgress, contentKind, extractModel);
}
