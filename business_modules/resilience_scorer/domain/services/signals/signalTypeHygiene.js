/**
 * Cross-source post-extract signal_type corrections (news, radio, field, PBO).
 */
import { canonicalizeSignalType } from '../../contracts/signalCatalog.js';

export { SIGNAL_ALIASES as FIELD_REPORT_SIGNAL_TYPE_ALIASES } from '../../contracts/signalCatalog.js';

/**
 * @param {string | null | undefined} type
 * @returns {string}
 */
export function resolveSignalTypeAlias(type) {
  return canonicalizeSignalType(type);
}

/**
 * True if any of the given patterns matches. Splitting a wide alternation into
 * several smaller regexes keeps each one's regex-complexity within lint limits
 * while preserving the original "matches any alternative" semantics.
 * @param {RegExp[]} patterns
 * @param {string} text
 * @returns {boolean}
 */
function testAny(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/** Evidence describing internal organizing gap, not state abandonment mood. */
const COMMUNITY_BACKBONE_GAP_PATTERNS = [
  /community\s+backbone/i,
  /backbone\s+structure/i,
  /גרעין\s+קהילתי/i,
  /חסר\s+גרעין/i,
  /welfare\s+coordination/i,
  /רכז(?:ת)?\s+רווחה/i,
  /מימד\s+מנהיגות/i,
];

/** Ritual/ceremony access disrupted — closure or empty attendance, not continuity. */
const RITUAL_ACCESS_DISRUPTED_PATTERNS = [
  /without\s+public\s+attendance/i,
  /no\s+public\s+attendance/i,
  /(?:holy\s+)?sites?\s+(?:continue\s+to\s+be\s+)?closed/i,
  /(?:churches?|mosques?|synagogues?)\s+(?:remain\s+)?closed/i,
  /closed\s+due\s+to/i,
  /(?:ceremon(?:y|ies)|services?|worship|prayers?)\s+(?:were\s+)?cancel(?:led|ed)/i,
  /בלי\s+קהל/i,
  /ללא\s+נוכחות\s+ציבור/i,
  /סגור(?:ים|ות)?\s+בשל/i,
];

/** Ritual clearly continued with meaningful public participation. */
const RITUAL_CONTINUED_PATTERNS = [
  /with\s+public\s+attendance/i,
  /thousands\s+(?:of\s+)?(?:worshipers|pilgrims|attendees|faithful)/i,
  /(?:ceremony|ritual|holiday|festival)\s+(?:went\s+ahead|proceeded|continued\s+as\s+usual|held\s+as\s+usual)/i,
  /held\s+as\s+usual/i,
  /משתתפים רבים/i,
];

const RITUAL_CONTINUITY_TYPES = new Set([
  'cultural_continuity',
  'commemoration_event_observed',
  'religious_coping_practice',
]);

/**
 * @param {string} signalType
 * @param {string} evidence
 * @returns {string}
 */
export function rewriteMisclassifiedSignalType(signalType, evidence) {
  const type = resolveSignalTypeAlias(signalType);
  const text = String(evidence ?? '');

  if (testAny(COMMUNITY_BACKBONE_GAP_PATTERNS, text)) {
    if (type === 'institutional_abandonment_perception' || type === 'resource_shortage') {
      return 'coordination_failure';
    }
  }

  if (
    RITUAL_CONTINUITY_TYPES.has(type)
    && testAny(RITUAL_ACCESS_DISRUPTED_PATTERNS, text)
    && !testAny(RITUAL_CONTINUED_PATTERNS, text)
  ) {
    return 'service_disruption';
  }

  return type;
}

/** Clause describes civilian physical injury, not building damage. */
const POPULATION_HARM_CLAUSE_PATTERNS = [
  /בני\s+אדם/i,
  /אנשים/i,
  /תינוק(?:ות)?/i,
  /ילד(?:ה|ים)\s+נפצע/i,
  /נפגעים/i,
  /נפצעו/i,
  /פצועים/i,
  /הרוג/i,
  /נפגע\s+בגוף/i,
  /injured/i,
  /wounded/i,
  /killed/i,
  /casualties/i,
];

/** Clause describes physical damage to structures or infrastructure ("<subject> ... <damage verb>"). */
const INFRA_DAMAGE_SUBJECT_VERB_PATTERNS = [
  /גן(?:י)?(?:\s+ילדים)?.{0,80}?(?:ניזוק|נפגע(?:ו)?|נהרס|destroyed|damaged|hit)/i,
  /(?:בתי\s+ספר|בית\s+ספר).{0,80}?(?:ניזוק|נפגע(?:ו)?|נהרס|destroyed|damaged|hit)/i,
  /(?:מבנה|בניין|דיר(?:ה|ות)).{0,80}?(?:ניזוק|נפגע(?:ו)?|נהרס|destroyed|damaged|hit)/i,
  /(?:תשתית|כביש|חשמל|מפעל).{0,80}?(?:ניזוק|נפגע(?:ו)?|נהרס|destroyed|damaged|hit)/i,
  /(?:kindergarten|school|building|infrastructure).{0,80}?(?:ניזוק|נפגע(?:ו)?|נהרס|destroyed|damaged|hit)/i,
];
const INFRA_DAMAGE_CLAUSE_PATTERNS = [
  ...INFRA_DAMAGE_SUBJECT_VERB_PATTERNS,
  /(?:ניזוק|נזק\s+(?:כבד\s+)?נגרם).{0,50}?(?:גן|בית\s+ספר|מבנה|בניין|דירה)/i,
];

/** Clause boundaries: sentence-ending punctuation, a comma before a new damage subject, semicolons, or a "במקביל" (in parallel) connector. */
const CLAUSE_BOUNDARY_SOURCES = [
  /(?<=[.!?])\s+/u,
  /\s*,\s+(?=גן\s|בית\s+ספר|בתי\s+ספר|מבנה|בניין)/u,
  /\s*;\s+/u,
  /\s+במקביל[,،]?\s+/u,
].map((re) => re.source);
const CLAUSE_SPLIT_RE = new RegExp(CLAUSE_BOUNDARY_SOURCES.join('|'), 'u');

/**
 * @param {string} evidence
 * @returns {string[]}
 */
export function splitEvidenceClauses(evidence) {
  const text = String(evidence ?? '').trim();
  if (!text) return [];
  const parts = text
    .split(CLAUSE_SPLIT_RE)
    .map((s) => s.replace(/^במקביל[,،]?\s*/u, '').trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
}

/**
 * @param {string} clause
 * @returns {'harm_to_population' | 'infrastructure_damage_acute' | null}
 */
export function classifyHarmInfrastructureClause(clause) {
  const text = String(clause ?? '').trim();
  if (!text) return null;
  const hasInfra = testAny(INFRA_DAMAGE_CLAUSE_PATTERNS, text);
  const hasHarm = testAny(POPULATION_HARM_CLAUSE_PATTERNS, text);
  if (hasInfra && !hasHarm) return 'infrastructure_damage_acute';
  if (hasHarm) return 'harm_to_population';
  return null;
}

/**
 * Split bundled harm + infrastructure facts into separate signals.
 * @param {object} signal
 * @returns {object[]}
 */
export function splitBundledHarmInfrastructure(signal) {
  if (!signal || typeof signal !== 'object') return [];
  const prevType = resolveSignalTypeAlias(signal.signal_type ?? signal.type);
  if (prevType !== 'harm_to_population' && prevType !== 'infrastructure_damage_acute') {
    return [signal];
  }

  const clauses = splitEvidenceClauses(signal.evidence);
  const harmClauses = [];
  const infraClauses = [];
  for (const clause of clauses) {
    const kind = classifyHarmInfrastructureClause(clause);
    if (kind === 'harm_to_population') harmClauses.push(clause);
    else if (kind === 'infrastructure_damage_acute') infraClauses.push(clause);
  }

  if (infraClauses.length === 0) return [signal];
  if (harmClauses.length === 0) {
    return [{
      ...signal,
      evidence: infraClauses.join('. '),
      signal_type: 'infrastructure_damage_acute',
      type: 'infrastructure_damage_acute',
    }];
  }

  const out = [{
    ...signal,
    evidence: harmClauses.join('. '),
    signal_type: 'harm_to_population',
    type: 'harm_to_population',
  }];
  out.push({
    ...signal,
    evidence: infraClauses.join('. '),
    signal_type: 'infrastructure_damage_acute',
    type: 'infrastructure_damage_acute',
  });
  return out;
}

/** Criminal / street violence — not war-emergency civilian resilience behavior. */
const CRIMINAL_VIOLENCE_EVIDENCE_RE =
  /(?:אירוע אלימות|נורה מטווח אפס|תוך כדי מרדף|פציעה חודרת|נרצח ב|נורה למוות)/i;

/** War/emergency attack framing — keep even if wording overlaps crime patterns. */
const WAR_EMERGENCY_FRAMING_RE =
  /(?:ירי(?:ם)?\s+מ(?:איראן|לבנון)|טיל(?:ים)?|רקט(?:ות)?|שיגור|אזעק(?:ה|ות)|יירוט|משברי יירוט|מלחמה)/i;

/** National EMS cumulative or batch roll-ups — not community behavioral evidence. */
const EMS_AGGREGATE_ROLLUP_RE =
  /(?:מתחילת מבצע|מאז תחילת).{0,80}\d{3,}|מגן דוד אדום.{0,60}טיפול רפואי ל-?\s*\d{2,}.\{0,50}בני אדם/i;

/** Types that should not pad regional report national-context pools. */
export const NATIONAL_CONTEXT_EXCLUDED_SIGNAL_TYPES = new Set([
  'harm_to_population',
  'population_survey_finding',
  'near_miss_reported',
  'routine_disruption',
]);

/** Signal types dropped when evidence is a bare hazard ticker only. */
const BARE_HAZARD_DROP_TYPES = new Set(['routine_disruption', 'near_miss_reported']);

/** Alert/siren activation or salvo headline without resident behavior or outcome. */
const BARE_ALERT_ACTIVATION_PATTERNS = [
  /אזעק(?:ה|ות).{0,120}(?:הופעל|הושמע|נשמע|התריע)/i,
  /התרע(?:ה|ות).{0,80}(?:הופעל|נשמע|ניתנ)/i,
  /alerts?\s+(?:were\s+)?(?:activated|sounded)/i,
  /sirens?\s+(?:were\s+)?(?:activated|sounded)/i,
  /(?:ירי|שיגור).{0,40}(?:טיל|רקט)(?:ים|ות)?/i,
];

/** Resident behavior, coping, or distinct outcome — keep even when alerts are mentioned. */
const RESILIENCE_BEHAVIORAL_CONTENT_PATTERNS = [
  /תושבים|נכנס|יצא|מקלט|ממר״|ממ"ד|שגרה|פתוח|סגור/i,
  /נפצע|ניזוק|נפגע|ילד|בית\s+ספר|עבודה|מסחר|למודים/i,
  /התעלמ|לא\s+נכנס|חזרו|נפילה|פגיעה|התפוצצ/i,
  /compliance|shelter|residents?|routine|shops?|school/i,
  /movement\s+of|emergency\s+routine|no\s+vehicles|empty\s+street/i,
];

/**
 * @param {string} evidence
 * @returns {boolean}
 */
export function isBareHazardTickerEvidence(evidence) {
  const text = String(evidence ?? '');
  if (!testAny(BARE_ALERT_ACTIVATION_PATTERNS, text)) return false;
  return !testAny(RESILIENCE_BEHAVIORAL_CONTENT_PATTERNS, text);
}

/**
 * @param {string} evidence
 * @returns {boolean}
 */
export function isCriminalViolenceEvidence(evidence) {
  const text = String(evidence ?? '');
  if (!CRIMINAL_VIOLENCE_EVIDENCE_RE.test(text)) return false;
  return !WAR_EMERGENCY_FRAMING_RE.test(text);
}

/**
 * @param {string} evidence
 * @returns {boolean}
 */
export function isEmsAggregateRollupEvidence(evidence) {
  return EMS_AGGREGATE_ROLLUP_RE.test(String(evidence ?? ''));
}

/**
 * Drop crime, EMS roll-ups, and other non-resilience casualty noise at extract time.
 * @param {object} signal
 * @returns {boolean}
 */
export function shouldDropNonResilienceCasualtySignal(signal) {
  const evidence = String(signal?.evidence ?? '');
  if (!evidence.trim()) return true;
  const type = resolveSignalTypeAlias(signal?.signal_type ?? signal?.type);
  if (isCriminalViolenceEvidence(evidence)) return true;
  if (isEmsAggregateRollupEvidence(evidence)) return true;
  if (type === 'population_survey_finding' && /מגן דוד אדום|מד[״"']?א/.test(evidence) && /\d{2,}/.test(evidence)) {
    return true;
  }
  if (BARE_HAZARD_DROP_TYPES.has(type) && isBareHazardTickerEvidence(evidence)) {
    return true;
  }
  return false;
}

/**
 * @param {object} signal
 * @returns {boolean}
 */
export function isExcludedNationalContextSignalType(signal) {
  const type = resolveSignalTypeAlias(signal?.signal_type ?? signal?.type);
  return NATIONAL_CONTEXT_EXCLUDED_SIGNAL_TYPES.has(type);
}

/**
 * @param {object[]} signals
 * @returns {object[]}
 */
export function applySignalTypeHygiene(signals) {
  if (!Array.isArray(signals)) return [];
  const out = [];
  for (const signal of signals) {
    if (!signal || typeof signal !== 'object') continue;
    if (shouldDropNonResilienceCasualtySignal(signal)) continue;
    const prev = signal.signal_type ?? signal.type;
    const signalType = rewriteMisclassifiedSignalType(prev, signal.evidence);
    const rewritten = signalType === prev ? signal : { ...signal, signal_type: signalType, type: signalType };
    out.push(...splitBundledHarmInfrastructure(rewritten));
  }
  return out;
}

/** Post-extract cleanup for PBO / field-report signals. */
const TRIVIAL_FIELD_REPORT_EVIDENCE_RE = /^(אין|ללא שינוי|אותו דבר|אותו הדבר|none|n\/a|—|-|\.)$/i;

const AVG_SCORE_BLOB_RE = /\[([^\]]+)\]\s*[^:]+:\s*avg=\d+%(?:\s*\([^)]*\))?\s*(?:—\s*)?/gi;

/**
 * @param {string | null | undefined} text
 * @returns {boolean}
 */
export function isTrivialFieldReportEvidence(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return true;
  if (trimmed.length < 3) return true;
  if (TRIVIAL_FIELD_REPORT_EVIDENCE_RE.test(trimmed)) return true;
  const afterMuni = trimmed.replace(/^\[[^\]]+\]\s*/, '').trim();
  if (TRIVIAL_FIELD_REPORT_EVIDENCE_RE.test(afterMuni)) return true;
  return false;
}

/**
 * Strip officer score-summary blobs; return substantive remainder.
 * @param {string} evidence
 * @returns {string}
 */
export function stripFieldReportScoreBlob(evidence) {
  let out = String(evidence ?? '');
  out = out.replaceAll(AVG_SCORE_BLOB_RE, '');
  out = out.replaceAll(/\bavg=\d+%(?:\s*\([^)]*\))?/gi, '');
  return out.replaceAll(/\s+/g, ' ').trim();
}

/**
 * @param {object} signal
 * @returns {object | null}
 */
export function sanitizeFieldReportSignal(signal) {
  if (!signal || typeof signal !== 'object') return null;

  let evidence = stripFieldReportScoreBlob(signal.evidence ?? '');
  const signalType = rewriteMisclassifiedSignalType(signal.signal_type ?? signal.type, evidence);

  if (isTrivialFieldReportEvidence(evidence)) return null;

  return {
    ...signal,
    signal_type: signalType,
    type: signalType,
    evidence,
  };
}

/**
 * @param {object[]} signals
 * @returns {object[]}
 */
export function applyFieldReportSignalHygiene(signals) {
  if (!Array.isArray(signals)) return [];
  const out = [];
  for (const signal of signals) {
    const cleaned = sanitizeFieldReportSignal(signal);
    if (cleaned) out.push(cleaned);
  }
  return out;
}
