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
  SIGNAL_CATALOG,
  SIGNAL_TYPES,
  summarizeConfidence,
  overallScore,
  scoreComponents,
} from '../domain/services/behaviorSignals.js';
import {
  DOMAIN_GROUPS,
  isMultipassEnabled,
  buildDomainScopeSuffix,
  buildSelfCheckPrompt,
} from './extractionPasses.js';
import {
  verifyEvidenceAgainstArticle,
  dedupeSignalsWithinBatch,
} from './signalVerification.js';

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
  `- solidarity_help_others / community_volunteering: ONLY when an explicit act of helping, assisting, or supporting\n` +
  `  another person is described. The act must be named — not inferred from proximity or mention of neighbors.\n` +
  `  ACCEPT: "residents brought food to elderly neighbors who couldn't reach shelters"\n` +
  `  REJECT: "I went to find my family; I saw my neighbors' children were injured" — no helping act present\n` +
  `  REJECT: "a community gathered in a shelter" — co-location is not solidarity\n` +
  `- Witnessing or hearing about harm to others (injured children, suffering neighbors, casualties) → harm_to_population, NOT solidarity\n` +
  `- Accumulated trauma, PTSD, chronic sleep disruption, grief (reported in named quote or survey) → psychological_distress (NOT fear_expression, which is situational/in-the-moment)\n` +
  `- People accessing therapy, trauma hotlines, mental health programs, or community wellbeing services → wellbeing_support_accessed\n` +
  `- Emergency family reunification / finding family during evacuation → compliance_enter_shelter or lifesaving domain, NOT solidarity\n` +
  `- Education operating remotely / schools closed → service_disruption or service_continuity (functional_continuity domain), NOT information_*\n` +
  `- Businesses closed, clinics not operating, transport cancelled, business operations impaired by war, livelihoods disrupted, income lost → service_disruption (functional_continuity domain)\n` +
  `- LIVELIHOOD DISTRESS vs FEAR vs AID GAP — disambiguation:\n` +
  `  (a) A business owner describing their business being damaged/threatened/on-the-edge by the war, even with emotional language ("brought us to the edge", "my baby", "never thought the business would be harmed")\n` +
  `      → service_disruption. The behavioral fact is the business/livelihood being disrupted; emotional framing does not move it to wellbeing.\n` +
  `  (b) Self-employed/workers reportedly forced to change budgets, seek financial adjustments, or manage reduced income due to war\n` +
  `      → service_disruption (their functional/economic routine is disrupted). Not resource_shortage unless a specific state aid/support gap is named.\n` +
  `  (c) resource_shortage for livelihoods: use ONLY when a named aid/support/compensation gap is described ("not a single shekel of compensation has reached business owners", "hundreds of thousands await promised grants"). The signal is the missing institutional response, not the livelihood hardship itself.\n` +
  `  (d) fear_expression: reserve for personal safety/trauma fear (sirens, shelters, physical threat) by a named individual. Do NOT use for distress about business viability — that is functional, not safety, and belongs under service_disruption.\n` +
  `- STATE ADMINISTRATIVE CONTINUITY vs RESOURCE MOBILIZATION — disambiguation:\n` +
  `  (a) Government agency adapting administrative schedules to the emergency (National Insurance / Bituach Leumi\n` +
  `      paying allowances early, Tax Authority extending filing deadlines, Ministry rescheduling services,\n` +
  `      Home Front Command easing restrictions) → service_continuity (functional_continuity only).\n` +
  `      These are institutional adjustments to keep the system operating — NOT targeted aid mobilization.\n` +
  `      Do NOT use resource_mobilization (which routes weight into wellbeing_atrisk); use service_continuity.\n` +
  `  (b) resource_mobilization: reserve for ACTIVE mobilization of material/human aid to SPECIFIC at-risk\n` +
  `      populations ("municipality dispatched food packages to 900 elderly households", "NGO mobilized 200\n` +
  `      volunteers to staff shelters for Arab-community evacuees"). Not for blanket administrative adaptations.\n` +
  `  (c) If the state agency is merely announcing/directing (without executing the service change) → leadership_clear_guidance.\n` +
  `- COMMERCIAL TRANSPORT & FOREIGN CARRIER SUSPENSIONS:\n` +
  `  Wizz Air, El Al, Ryanair, cruise lines, or any commercial transport operator suspending/resuming service\n` +
  `  to/from Israel → service_disruption (if suspended) or service_continuity (if resumed).\n` +
  `  This is functional_continuity of civilian transport; do NOT classify as fear_expression, harm_to_population,\n` +
  `  or any wellbeing signal. Foreign carrier decisions are a civilian-mobility functional signal.\n` +
  `- צח"י (צוות חוסן יישובי — community resilience team): a volunteer-based local emergency leadership body\n` +
  `  that coordinates with council, MDA, fire, police, and IDF. Extract TWO signals when צח"י is mentioned:\n` +
  `  (1) leadership_visible_presence (active) or leadership_absence (missing/needed)\n` +
  `  (2) community_volunteering (active) or resource_shortage (missing/needed)\n` +
  `  צח"י is both a leadership structure and a community capital asset.\n` +
  `- system_overload vs resource_shortage: use system_overload when infrastructure is operating but at dangerous\n` +
  `  capacity relative to demand (one ICU for 115,000 residents; ER wait times tripled; ambulances unavailable).\n` +
  `  Use resource_shortage when material supplies or services are simply absent (no shelters in a neighbourhood,\n` +
  `  no compensation payments issued, volunteers ran out of food packages).\n` +
  `- resilience_narrative_positive / resilience_narrative_negative: ONLY when RESIDENTS or AFFECTED CIVILIANS
  explicitly characterise how their community is coping — a subjective judgement about the collective story,
  mood, or spirit, using WORDS ABOUT MOOD, SPIRIT, or COPING IDENTITY (not descriptions of conditions or services).
  The speaker MUST be a resident, evacuee, or person directly affected by the situation — someone describing
  their OWN community's experience from the inside.
  ACCEPT: "people here say we're managing fine", "the spirit in the north has broken", "residents feel abandoned by the state"
  ACCEPT: "the community sees itself as holding the line", "morale is high despite the situation"
  ACCEPT: a named resident of an affected area describing how their community feels or copes
  REJECT: politicians, ministers, mayors, or officials making rhetorical speeches about national resilience or spirit.
    Officials declaring "we are strong" or "the spirit of Israel" are performing leadership, not reporting community mood.
    If they give actionable guidance, use leadership_clear_guidance instead.
  REJECT: diaspora voices, events outside Israel, or statements about antisemitism abroad — these are outside scope.
  REJECT: celebrities, public figures, or inspirational speakers offering general coping wisdom.
  REJECT: a list of observable conditions (empty streets, closed businesses, no frameworks, self-evacuation).
  REJECT: field-observer summary labels: "overall resilience present", "strong settlement", "population coping",
    "community functioning well". These are abstract assessments, not expressed narratives — either split into
    the specific factual signals that underlie the assessment, or discard if too vague.
  REJECT: descriptions of services, programs, or frameworks (e.g. "protected space for children", "employment
    program operating"). These are service_continuity or service_disruption signals, not narratives.
  REJECT: political instability, governance issues, or institutional trust problems — use political_trust signal types.
  Observable conditions are FACTS — classify them under the appropriate factual signal type
  (service_disruption, evacuation_displacement, routine_disruption, resource_shortage, etc.).
  A community with empty streets is not necessarily rejecting a narrative — it may simply be describing its situation.
  ⚠ FIELD REPORTS: field observer summaries are almost never narrative signals. Field teams report observable
  conditions — classify each concrete observation under its factual signal type. Only use resilience_narrative_*
  for field data when the observer quotes residents characterising their own collective story.
- leadership_clear_guidance: ONLY when an authority provides specific, actionable EMERGENCY directions to civilians\n` +
  `  (e.g. "HFC approved easing of restrictions", "municipality announced shelter hours").\n` +
  `  The authority must be giving directions that civilians can ACT ON for their safety or daily emergency routine.\n` +
  `  REJECT: pundits/experts discussing strategy, institutional appointments, military personnel decisions,\n` +
  `    geopolitical analysis, or any commentary that uses words like "guidance" or "clear" but is not\n` +
  `    an authority directing civilians. A civilian DEMANDING guidance is NOT leadership_clear_guidance —\n` +
  `    it is resource_shortage (if demanding aid) or political_trust (if demanding accountability).\n` +
  `  leadership_clear_guidance vs information_* types: An authority publishing or updating guidelines is a\n` +
  `  LEADERSHIP action → leadership_clear_guidance. It tells us the authority acted, NOT that people received,\n` +
  `  understood, or were influenced by the information. Only use information_* types when the evidence describes\n` +
  `  the RECEPTION side: did people get the info? Was it clear or confusing? Did it match reality?\n` +
  `- information_* types are ONLY for: residents receiving/missing/seeking EMERGENCY SAFETY or OPERATIONAL guidance\n` +
  `  about immediate protective actions (shelters, alerts, evacuation routes, HFC restrictions),\n` +
  `  rumor spread, or contradictory official emergency messages.\n` +
  `  REJECT from ALL information_* types:\n` +
  `  - Education policy disputes (exam frameworks, matriculation relief, school schedules) → service_disruption\n` +
  `  - Demands for policy clarification from politicians (mayors demanding PM clarify policy) → political_trust\n` +
  `  - Ministerial PR statements about recovery (aviation, tourism, economy) → routine_maintenance\n` +
  `  - Descriptions of existing laws or legal rights → DO NOT EXTRACT (background legal fact, not behavioral evidence)\n` +
  `  - Academic/international research papers → DO NOT EXTRACT (research ≠ actionable guidance that reached people)\n` +
  `  - Service adequacy complaints ("exam framework not adapted") → service_disruption, NOT information_effectiveness_gap\n` +
  `  KEY TEST: does the evidence show the HUMAN SIDE of information — people receiving, understanding,\n` +
  `  acting on, or failing to receive/understand/act on emergency safety guidance?\n` +
  `  Mere issuance of alerts or warnings (without evidence of reception or failure) → DO NOT EXTRACT.\n` +
  `  If it describes a service not meeting needs → service_disruption. Political demands → political_trust.\n` +
  `- active_information_seeking: ONLY when a resident or group explicitly seeks emergency or protective guidance — e.g. calling an HFC hotline, checking alert apps, asking where the nearest shelter is, seeking evacuation instructions.\n` +
  `  REJECT: consulting a lawyer about a will or inheritance; asking about financial relief; seeking religious guidance; any general wartime planning unrelated to immediate safety.\n` +
  `  A surge in will-writing, legal consultations, or financial inquiries during wartime → fear_expression (if named quote) or omit. It is NOT active_information_seeking.\n` +
  `  information_actionable_effective: EMERGENCY guidance was specific and situation-matched — people could follow it\n` +
  `  given actual constraints (accessible shelter, legally permitted to stop work, covers the scenario they faced).\n` +
  `  Use ONLY when evidence shows emergency/safety guidance worked in practice — i.e. people RECEIVED it AND could act on it.\n` +
  `  REJECT: routine alert issuance ("council issued alert to stay near shelters", "ministry warned public").\n` +
  `  Alerts being sent is the baseline — it happens dozens of times daily and tells us nothing about whether\n` +
  `  information actually reached people or improved their coping. Only extract when there is evidence of\n` +
  `  RECEPTION, COMPREHENSION, or BEHAVIORAL RESPONSE to the information (e.g. "residents reported the new\n` +
  `  app delivered alerts faster", "instructions were clear enough that people knew which shelter to use").\n` +
  `  NOT for: academic studies, legal descriptions, policy announcements, or ministerial statements.\n` +
  `  information_effectiveness_gap: EMERGENCY guidance existed and was distributed, but failed to help because it\n` +
  `  did not match reality — instructions people physically or legally could not follow, scenarios left uncovered\n` +
  `  (mass casualties, no nearby shelter, workers with no legal protection to stop), or contradictions between\n` +
  `  official sources that left people unable to act. Do NOT use for mere absence of information — use information_confusion.\n` +
  `  Do NOT use for education/service adequacy complaints — those are service_disruption.\n` +
  `  Do NOT use for economic relief/compensation gaps — those are resource_shortage.\n` +
  `- rumor_spread: ONLY for false or unverified claims about EMERGENCY SAFETY conditions spreading among civilians\n` +
  `  (e.g. "residents sharing false reports of chemical attack", "WhatsApp groups spreading unverified casualty numbers").\n` +
  `  REJECT: political media framing (Haredi media framing a leak as conspiracy), partisan spin, or editorial bias.\n` +
  `  Media framing of political events is political discourse, not emergency rumor spread.\n` +
  `- information_confusion: ONLY for contradictory or unclear EMERGENCY SAFETY messages from authorities that leave\n` +
  `  civilians unable to act (e.g. "one authority says shelter-in-place, another says evacuate").\n` +
  `  REJECT: police/security investigation updates, criminal investigations, or any non-emergency operational status.\n` +
  `- Emergency response to a harm event (ambulance to cardiac arrest, hospital treating injury): classify the harm itself as harm_to_population. Do NOT emit service_continuity — a service doing its normal job is not evidence of elevated functioning.\n` +
  `- coordination_success: the positive counterpart to coordination_failure. Use when two or more named agencies, services,\n` +
  `  or organizations visibly coordinate on the SAME emergency response (HFC + municipality + MDA jointly running a drill;\n` +
  `  council + welfare dept. + IDF unit jointly evacuating a neighbourhood). REJECT generic statements about cooperation\n` +
  `  intent, photo-ops, or solo institutional action — coordination requires multiple named bodies acting together on a\n` +
  `  shared concrete task.\n` +
  `- feedback_loop_closure: an authority visibly ACTS on community input — fixes a complaint that was raised, opens a\n` +
  `  shelter that residents demanded, modifies a guideline because of feedback. The fact must show BOTH the input AND the\n` +
  `  responsive action. Mere "we listened" speeches do not qualify.\n` +
  `- rumor_correction: the positive counterpart to rumor_spread. An authority, expert, or community member publicly debunks\n` +
  `  or corrects a circulating false report about emergency conditions (chemical-attack hoax corrected; casualty-number\n` +
  `  rumor refuted). REJECT generic "fake news" complaints with no specific claim+correction.\n` +
  `- system_resilience_under_load: a named system continues operating effectively under DOCUMENTED elevated demand or\n` +
  `  damage (hospital triaged 200 patients in 4 hours; one dispatch centre handled 3× normal call volume). REJECT routine\n` +
  `  service operation — the elevated load must be named.\n` +
  `- post_event_recovery_indicator: a community visibly recovers after a hit — re-opens businesses, returns evacuees, restarts\n` +
  `  services after a strike/closure. The "after" is essential; first-day-back stories qualify, ongoing-normal stories do not.\n` +
  `- local_capacity_demonstrated: positive counterpart to dependency_on_external_aid. The community uses its OWN resources\n` +
  `  (own funds, own labour, own infrastructure) to meet emergency needs without leaning on outside aid. Use when the\n` +
  `  evidence explicitly contrasts with external dependency or names the local provider.\n` +
  `- information_inclusivity_present / information_inclusivity_gap: emergency information adapted (or not) for at-risk\n` +
  `  populations — Arabic translations, sign language, accessible formats, elder outreach. Use ONLY when a specific group\n` +
  `  is named (Arab residents, deaf community, elderly without smartphones, visually impaired). Generic "everyone got the\n` +
  `  message" is not inclusivity evidence.\n` +
  `- economic_continuity / economic_disruption: distinct from generic service_disruption. Use when the evidence is about\n` +
  `  EMPLOYMENT, BUSINESS OPERATIONS, or COMMERCE specifically (factory still running; restaurant closed; tourism collapsed;\n` +
  `  workers laid off). For non-economic services (schools, clinics, transport) keep using service_continuity / service_disruption.\n` +
  `- cultural_continuity: identity-bearing rituals, ceremonies, holidays, religious observance, or cultural events that took\n` +
  `  place during the emergency (Passover seder held under fire; memorial ceremony despite siren; community Iftar). Distinct\n` +
  `  from service_continuity (a cultural event is not a service).\n\n` +

  `━━━ SIGNAL TYPES (closed vocabulary) ━━━\n` +
  `${formatSignalCatalog()}\n\n` +

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
  `  "extraction_confidence": <number 0.0-1.0 — your self-rated confidence that this signal is correctly classified and faithfully grounded in the article>\n` +
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
  `                   "belonging_solidarity","wellbeing_atrisk"]\n\n` +
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
  const INDIVIDUAL_EMOTIONAL_SIGNAL_TYPES = new Set(['fear_expression', 'calm_confidence']);

  const valid = signals.filter((s) => {
    if (!s || typeof s !== 'object') return false;
    if (!validTypes.has(s.signal_type)) {
      console.error(`  ⚠ [${sourceLabel}] Dropped unknown signal type: "${s.signal_type}"`);
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
    return true;
  });

  for (const s of valid) {
    const art = articles[s.article_index - 1];
    if (art) {
      s.article_source = art.source;
      s.temporal_weight = art.temporal_weight ?? 1.0;
    }
  }

  return valid;
}

/**
 * Verifies each signal's evidence against its source article body using
 * Jaccard shingle similarity. Drops signals that fail the type-specific
 * threshold. Logs the drop reason for auditability.
 */
function applyEvidenceVerifier(signals, articles, sourceLabel) {
  const verified = [];
  let dropped = 0;
  for (const s of signals) {
    const art = articles[s.article_index - 1];
    const result = verifyEvidenceAgainstArticle(s, art?.body);
    if (result.ok) {
      verified.push(s);
      continue;
    }
    dropped++;
    const evPreview = (s.evidence ?? '').slice(0, 80).replace(/\s+/g, ' ');
    console.error(
      `  ⚠ [${sourceLabel}] Dropped unverifiable evidence ` +
      `(${result.reason}${result.sim != null ? `, sim=${result.sim.toFixed(2)}` : ''}): ` +
      `[${s.signal_type}] "${evPreview}…"`,
    );
  }
  if (dropped > 0) {
    console.error(`  → [${sourceLabel}] verifier dropped ${dropped}/${signals.length} signal(s)`);
  }
  return verified;
}

async function callHaikuExtraction(articles, batchLabel, retries, usageCallback, contentKind, domainGroupKey) {
  const baseSystem = buildSignalExtractionSystemPrompt(contentKind);
  const system = domainGroupKey
    ? `${baseSystem}\n\n${buildDomainScopeSuffix(domainGroupKey)}`
    : baseSystem;
  const userContent =
    `Extract all behavioral signals from these Israeli ${extractUserLabelForSignals(contentKind)}:\n\n` +
    formatArticlesForPrompt(articles);

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const stream = client.messages.stream({
        model: 'claude-haiku-4-5-20251001',
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
      if (usageCallback) usageCallback({ label: batchLabel, model: 'claude-haiku-4-5-20251001', usage: message.usage });

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
      model: 'claude-haiku-4-5-20251001',
      max_tokens: Math.min(4000, 60 + indices.length * 30),
      temperature: 0,
      system,
      messages: [{ role: 'user', content: user }],
    });
    const selfLabel = `${batchLabel} self-check`;
    await streamWithProgress(stream, selfLabel);
    const message = await stream.finalMessage();
    if (usageCallback) usageCallback({ label: selfLabel, model: 'claude-haiku-4-5-20251001', usage: message.usage });
    const textBlock = message.content.find((b) => b.type === 'text');
    if (!textBlock) return signals;
    const verdicts = extractJsonArray(textBlock.text);
    if (!Array.isArray(verdicts)) return signals;
    const noSet = new Set();
    for (const v of verdicts) {
      if (v && (v.verdict === 'no' || v.verdict === 'No' || v.verdict === 'NO')) {
        const idx = Number(v.index);
        if (Number.isInteger(idx)) noSet.add(idx);
      }
    }
    if (noSet.size === 0) return signals;
    const survivors = signals.filter((_, i) => !noSet.has(i));
    console.error(`  → [${batchLabel}] self-check dropped ${noSet.size}/${signals.length} signal(s)`);
    return survivors;
  } catch (err) {
    console.error(`  ⚠ ${batchLabel} self-check failed (${err.message}) — keeping all signals`);
    return signals;
  }
}

async function extractSignalsBatch(articles, batchLabel, retries = 3, usageCallback = null, contentKind = 'news') {
  const useMultipass = isMultipassEnabled() &&
    contentKind !== 'whatsapp_realtime' &&
    contentKind !== 'whatsapp_interactive';

  let raw = [];
  if (useMultipass) {
    const groupKeys = Object.keys(DOMAIN_GROUPS);
    for (const key of groupKeys) {
      const passLabel = `${batchLabel} pass-${key}`;
      const passSignals = await callHaikuExtraction(
        articles, passLabel, retries, usageCallback, contentKind, key,
      );
      console.error(`  → ${passLabel}: ${passSignals.length} candidate(s)`);
      raw = raw.concat(passSignals);
    }
  } else {
    raw = await callHaikuExtraction(articles, batchLabel, retries, usageCallback, contentKind, null);
  }

  const beforeDedup = raw.length;
  raw = dedupeSignalsWithinBatch(raw);
  if (raw.length < beforeDedup) {
    console.error(`  → [${batchLabel}] in-batch dedup: ${beforeDedup} → ${raw.length}`);
  }

  let valid = validateSignalsFromCall(raw, articles, batchLabel);
  valid = applyEvidenceVerifier(valid, articles, batchLabel);
  valid = await runSelfCheck(valid, batchLabel, usageCallback);
  return valid;
}

/**
 * Step 1: Extract behavioral signals from articles.
 * Signals use a closed vocabulary; their mapping to components is done by code in behaviorSignals.js.
 *
 * @param {Array} articles   Flat array from loadMdFiles()
 * @returns {Array}          Signal objects: { article_index, article_url, signal_type, evidence_class, scope_level, confidence, evidence }
 */
export async function extractSignals(articles, { onUsage, onProgress, contentKind = 'news' } = {}) {
  if (articles.length <= EVIDENCE_BATCH_SIZE) {
    onProgress?.({ type: 'progress', step: 'extract', message: 'Extracting behavioral signals...' });
    return extractSignalsBatch(articles, '[Step 1 — Signal extraction]', 3, onUsage, contentKind);
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
    const signals = await extractSignalsBatch(batches[i], label, 3, onUsage, contentKind);
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
function formatScoredComponentsForNarrative(scoredComponents, totalArticles) {
  return RESILIENCE_COMPONENTS.map((compDef) => {
    const scored = scoredComponents[compDef.id];
    const conf = summarizeConfidence(scored?.confidence);
    const signals = (scored?.signals ?? []).map((s) => {
      const fd = s.signal_file_date ? `  Source bundle date: ${s.signal_file_date}\n` : '';
      return (
        `  [${s.signal_type}] (scope:${s.scope_level ?? 'single_case'}, confidence:${s.confidence})\n` +
        `${fd}  Evidence: "${s.evidence}"${s.article_url ? `\n  URL: ${s.article_url}` : ''}`
      );
    }).join('\n');

    const ciTag = scored?.score_low != null && scored?.score_high != null
      ? `  CI: ${scored.score_low}-${scored.score_high}` : '';
    const polTag = scored?.polarization != null && scored.polarization > 0.5 && scored.evidence_mass > 4
      ? `  ⚠ contested (pol=${scored.polarization.toFixed(2)})` : '';
    const deltaTag = scored?.delta_score != null
      ? `  Δvs prev: ${scored.delta_score >= 0 ? '+' : ''}${scored.delta_score}` +
        (scored.delta_significance != null ? ` (z=${scored.delta_significance.toFixed(1)})` : '') +
        (scored.delta_flag === 'significant' ? ' SIGNIFICANT' : '')
      : '';
    const scoresSummary = scored?.score != null
      ? `Score: ${scored.score}/10  Certainty: ${(scored.certainty * 100).toFixed(0)}%  Direction: ${scored.strength >= 0 ? '+' : ''}${scored.strength.toFixed(2)}  (${scored.distinct_article_count}/${totalArticles} articles, ${(scored.coverage_ratio * 100).toFixed(1)}%, ${scored.dispersion} dispersion)  +ev:${scored.positive_evidence} −ev:${scored.negative_evidence}${ciTag}${polTag}${deltaTag}`
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
    return `[${r.date}] Overall: ${r.overall_resilience_score}/10\n${compScores}`;
  });
  return (
    `━━━ PRIOR DAYS' CONTEXT (SCORE TRAJECTORY ONLY) ━━━\n` +
    `Shows component scores only for earlier report dates. Use ONLY for trend wording (improving / declining / stable vs prior days).\n` +
    `Do NOT reuse factual geopolitical situations, timelines, treaty/ceasefire claims, battles, diplomacy, etc. from those days unless the SAME fact appears in TODAY's Evidence lines below.\n` +
    `Do not summarize or import earlier executive summaries.\n\n` +
    `${sections.join('\n\n')}\n\n`
  );
}

function formatComparisonScoresContext(scopeLabel, scoredComponents) {
  if (!scopeLabel || !scoredComponents) return '';
  const compScores = RESILIENCE_COMPONENTS.map((def) => {
    const c = scoredComponents[def.id] ?? {};
    return `- ${def.id}: ${c.score ?? 'n/a'}/10, confidence=${c.confidence ?? 'n/a'}, signals=${c.signal_count ?? 0}`;
  }).join('\n');
  return (
    `━━━ COMPARISON CONTEXT: ${scopeLabel.toUpperCase()} ━━━\n` +
    `Use these pre-computed comparison scores as context only. The report you are writing is for the requested scope; ` +
    `do not average these scores into the scoped scores. Mention differences only when analytically meaningful.\n` +
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
  } = {},
) {
  const priorContext = formatPriorReportsContext(priorReports);
  const comparisonContext = formatComparisonScoresContext(comparisonLabel, comparisonScores);
  const scopeContext = reportScope?.id === 'north'
    ? `━━━ REPORT SCOPE: NORTHERN ISRAEL ━━━\n` +
      `Write this assessment as a northern-region report, focused on civilians and communities in northern Israel. ` +
      `Use national context only as comparison. Be explicit when evidence is from a sub-region such as Naftali and avoid generalizing it to the whole north.\n\n`
    : '';

  const groundingContext =
    `━━━ GROUND TRUTH & DATE DISCIPLINE ━━━\n` +
    `Assessment anchor date for this JSON output: ${date}.\n` +
    `- The \"Signals extracted\" Evidence blocks ARE the allowable facts for TODAY's behavior picture. Treat each bundle-date line (when shown) as the dated provenance for that excerpt.\n` +
    `- cross_component_synthesis and every component narrative must only assert situations that fair readers could trace back to TODAY's Evidence text. You may add trend phrases using PRIOR DAYS' CONTEXT only when explicitly comparing score trajectories—never as a source of new factual events.\n` +
    `- Do not use independent world knowledge of Israel/Lebanon, military operations, treaties, diplomacy, or ceasefires—even if widely known or plausible.\n` +
    `- Do not state timelines (e.g. \"at midnight\", \"entered into force\", \"day N of truce\") unless that exact timetable or factual claim appears inside the Evidence strings you rely on.\n` +
    `- If evidence records expectations, rumours, or reported statements, phrase them strictly as attributed communications or observed reporting—never as externally verified geopolitical facts.\n` +
    `- When evidence conflicts, surface the conflict; do not resolve it from outside facts.\n\n`;

  const systemPrompt =
    `You are a community resilience analyst writing behavioral narratives for a structured report.\n` +
    `The component SCORES are already computed — do not re-score. Your job is to write clear, behavioral narratives.\n\n` +
    scopeContext +
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
    `- DELTA + CONTESTED EVIDENCE TAGS: When a component's pre-computed line shows "SIGNIFICANT" (|z|>2 vs 14-day baseline), include a brief trend phrase ("a notable shift vs the 14-day baseline"). When it shows "contested", note that the evidence is split between supporting and opposing observations rather than collapsing to a single verdict. Do not invent direction or magnitude beyond what the score+delta numbers say.\n` +
    `- SCOPE DISCIPLINE: Never use "the only", "the one exception", "uniquely", or similar exclusive claims.\n` +
    `  The inputs are a sample, not a census. Something appearing once in the data means it was reported once — not that it is the sole instance.\n` +
    `- LINKS: Each signal has a URL. When a signal has a URL, embed a markdown link for every significant claim:\n` +
    `    In narrative: append ([source](URL)) after the relevant sentence\n` +
    `    In evidence items: append ([source](URL)) at end of the item\n` +
    `    If a signal has no URL, omit the link — do not fabricate URLs\n\n` +

    `━━━ THE 8 COMPONENTS (with pre-computed scores and signals) ━━━\n\n` +
    `${formatScoredComponentsForNarrative(scoredComponents, totalArticles)}\n\n` +

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
          score_smoothed:     scored.score_smoothed ?? null,
          delta_score:        scored.delta_score ?? null,
          delta_significance: scored.delta_significance ?? null,
          delta_flag:         scored.delta_flag ?? null,
          facets:             scored.facets ?? null,
          // N9 explainability: bounded top contributors (by |_contribution|), enriched with
          // _contribution / _weight / _polarity by behaviorSignals.scoreComponents. Capped at
          // 10 to keep JSON payload size reasonable; UI takes top 3 from this list.
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
// so that api/analysisService.js and cross-cut-modules/budget token audit continue to work.

export async function synthesizeComponents(signals, date, totalArticles, { onUsage, onProgress, contentKind } = {}) {
  const scored = scoreComponents(signals, { totalArticles });
  return generateNarratives(scored, signals, date, totalArticles, { onUsage, onProgress, contentKind });
}
