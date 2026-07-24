/**
 * Cross-source post-extract signal_type corrections (news, radio, field, PBO).
 *
 * Pipeline position: after closed/open extraction, before signals land in
 * bundles / assess. Rewrites common misclassifications and drops non-resilience
 * noise (crime, EMS roll-ups, bare hazard tickers).
 *
 * Owns: rewriteMisclassifiedSignalType, shouldDrop*, applySignalTypeHygiene,
 * national-context exclusion set, bare-hazard / crime / EMS detectors.
 * Does NOT: define the catalog vocabulary (signalCatalog.js) or component
 * routing (signalRouting.js). Harm/infrastructure split is delegated to
 * harmInfrastructureSplit.js.
 *
 * Key collaborators: signalCatalog.js, harmInfrastructureSplit.js, extract CLIs
 * and field-report hygiene callers.
 */
import { canonicalizeSignalType } from '../../../contracts/signalCatalog.js';
import { splitBundledHarmInfrastructure, testAny } from './harmInfrastructureSplit.js';

/**
 * Resolve legacy / alias spellings to the canonical catalog type id.
 * @param {string | null | undefined} type
 * @returns {string}
 */
export function resolveSignalTypeAlias(type) {
  return canonicalizeSignalType(type);
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

/** Distress-dominated narrative evidence: mislabeled as a positive resilience narrative. */
const NARRATIVE_DISTRESS_PATTERNS = [
  /מצב נפשי (?:גרוע|קשה|רע)/i,
  /חולים נפשית|mentally ill/i,
  /ייאוש|despair/i,
  /פריפריה של הפריפריה|periphery of the periphery/i,
  /תחושת נטישה|abandon(?:ed|ment)/i,
  /מפחדים|פחד גדול|חרדה קשה/i,
];

/** Coping/endurance markers that legitimize a positive narrative despite hardship mentions. */
const NARRATIVE_COPING_PATTERNS = [
  /מתמודד|חוסן|ממשיכים|שגרה|נשמעים|הישמעות|מציית/i,
  /סולידריות|לכידות|אמון|ערבות הדדית/i,
  /נשארים|לא עוזבים|נלחמים על הבית/i,
  /coping|resilien|solidarity|staying|not leaving/i,
];

/**
 * Evidence-driven type rewrite for known extract confusions (backbone gap →
 * coordination_failure; disrupted ritual framed as continuity → service_disruption).
 * @param {string} signalType
 * @param {string} evidence
 * @returns {string} canonical type (possibly rewritten)
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

  // Polarity lint: distress-dominated evidence tagged as a positive narrative
  // (e.g. "אנשים מדברים על מצב נפשי גרוע ומפחדים") flips a component's balance
  // the wrong way. Rewrite only when no coping/endurance marker is present —
  // "afraid but staying/coping" narratives legitimately stay positive.
  if (
    type === 'resilience_narrative_positive'
    && testAny(NARRATIVE_DISTRESS_PATTERNS, text)
    && !testAny(NARRATIVE_COPING_PATTERNS, text)
  ) {
    return 'resilience_narrative_negative';
  }

  return type;
}

// --- Expected holiday closures ------------------------------------------------

/** Disruption types that a scheduled school holiday can fully explain. */
const HOLIDAY_NEUTRAL_DISRUPTION_TYPES = new Set([
  'service_disruption',
  'educational_disruption',
  'routine_disruption',
]);

/** Closure/disruption attributed to a scheduled school holiday, not the emergency. */
const HOLIDAY_CLOSURE_PATTERNS = [
  /חופשת\s*ה?(?:אביב|פסח|חג|קיץ)/i,
  /חופש(?:ה)?\s+גדול/i,
  /יצאו לחופש/i,
  /spring break|passover (?:break|holiday|vacation)|school (?:holiday|vacation)/i,
];

/** Emergency/conflict attribution — the disruption is NOT just the holiday. */
const EMERGENCY_ATTRIBUTION_PATTERNS = [
  /אזעק|טיל|רקט|כטב|יירוט|מלחמ|ביטחונ|חירום|מיגון|מקלט|ממ["״']?ד|פיקוד העורף|פקע["״']?ר|בגלל המצב|הסלמה/i,
  /siren|missile|rocket|war|security situation|emergency|shelter|protected space/i,
];

/**
 * True when a disruption signal is explained by a scheduled school holiday with
 * no emergency attribution. Schools closing for Passover break is the expected
 * calendar baseline — counting it as opposing continuity evidence manufactures
 * a war-disruption story out of the season (2026-04-01 report confound).
 * @param {object} signal
 * @returns {boolean}
 */
export function isExpectedHolidayClosureSignal(signal) {
  const type = resolveSignalTypeAlias(signal?.signal_type ?? signal?.type);
  if (!HOLIDAY_NEUTRAL_DISRUPTION_TYPES.has(type)) return false;
  const text = String(signal?.evidence ?? '');
  if (!testAny(HOLIDAY_CLOSURE_PATTERNS, text)) return false;
  return !testAny(EMERGENCY_ATTRIBUTION_PATTERNS, text);
}

/** Criminal / street violence — not war-emergency civilian resilience behavior. */
const CRIMINAL_VIOLENCE_EVIDENCE_RE =
  /(?:אירוע אלימות|נורה מטווח אפס|תוך כדי מרדף|פציעה חודרת|נרצח ב|נורה למוות)/i;

/** War/emergency attack framing — keep even if wording overlaps crime patterns. */
const WAR_EMERGENCY_FRAMING_RE =
  /(?:ירי(?:ם)?\s+מ(?:איראן|לבנון)|טיל(?:ים)?|רקט(?:ות)?|שיגור|אזעק(?:ה|ות)|יירוט|משברי יירוט|מלחמה)/i;

/** National EMS cumulative or batch roll-ups — not community behavioral evidence. */
const EMS_AGGREGATE_ROLLUP_RE =
  /(?:מתחילת מבצע|מאז תחילת).{0,80}\d{3,}|מגן דוד אדום.{0,60}טיפול רפואי ל-?\s*\d{2,}.{0,50}בני אדם/i;

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
 * True when evidence is only an alert/siren/salvo headline with no resident behavior.
 * @param {string} evidence
 * @returns {boolean}
 */
export function isBareHazardTickerEvidence(evidence) {
  const text = String(evidence ?? '');
  if (!testAny(BARE_ALERT_ACTIVATION_PATTERNS, text)) return false;
  return !testAny(RESILIENCE_BEHAVIORAL_CONTENT_PATTERNS, text);
}

/**
 * True when evidence reads as criminal/street violence without war-emergency framing.
 * @param {string} evidence
 * @returns {boolean}
 */
export function isCriminalViolenceEvidence(evidence) {
  const text = String(evidence ?? '');
  if (!CRIMINAL_VIOLENCE_EVIDENCE_RE.test(text)) return false;
  return !WAR_EMERGENCY_FRAMING_RE.test(text);
}

/**
 * True when evidence is a national EMS cumulative / batch casualty roll-up.
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
 * True when this type should not pad regional-report national-context pools.
 * @param {object} signal
 * @returns {boolean}
 */
export function isExcludedNationalContextSignalType(signal) {
  const type = resolveSignalTypeAlias(signal?.signal_type ?? signal?.type);
  return NATIONAL_CONTEXT_EXCLUDED_SIGNAL_TYPES.has(type);
}

/**
 * Full post-extract hygiene pass: drop noise, rewrite types, split bundled harm/infra.
 * @param {object[]} signals
 * @returns {object[]} cleaned signal list (may expand via split)
 */
export function applySignalTypeHygiene(signals) {
  if (!Array.isArray(signals)) return [];
  const out = [];
  for (const signal of signals) {
    if (!signal || typeof signal !== 'object') continue;
    if (shouldDropNonResilienceCasualtySignal(signal)) continue;
    if (isExpectedHolidayClosureSignal(signal)) continue;
    const prev = signal.signal_type ?? signal.type;
    const signalType = rewriteMisclassifiedSignalType(prev, signal.evidence);
    const rewritten = signalType === prev ? signal : { ...signal, signal_type: signalType, type: signalType };
    out.push(...splitBundledHarmInfrastructure(rewritten));
  }
  return out;
}
