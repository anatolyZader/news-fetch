/**
 * Cross-source post-extract signal_type corrections (news, radio, field, PBO).
 */

/** @type {Record<string, string>} */
export const FIELD_REPORT_SIGNAL_TYPE_ALIASES = {
  leadership_visible_present: 'leadership_visible_presence',
  non_compliance: 'compliance_partial',
};

/**
 * @param {string | null | undefined} type
 * @returns {string}
 */
export function resolveSignalTypeAlias(type) {
  const raw = String(type ?? '').trim();
  return FIELD_REPORT_SIGNAL_TYPE_ALIASES[raw] ?? raw;
}

/** Evidence describing internal organizing gap, not state abandonment mood. */
const COMMUNITY_BACKBONE_GAP_RE =
  /(?:community\s+backbone|backbone\s+structure|גרעין\s+קהילתי|חסר\s+גרעין|welfare\s+coordination|רכז(?:ת)?\s+רווחה|מימד\s+מנהיגות)/i;

/** Ritual/ceremony access disrupted — closure or empty attendance, not continuity. */
const RITUAL_ACCESS_DISRUPTED_RE =
  /(?:without\s+public\s+attendance|no\s+public\s+attendance|(?:holy\s+)?sites?\s+(?:continue\s+to\s+be\s+)?closed|(?:churches?|mosques?|synagogues?)\s+(?:remain\s+)?closed|closed\s+due\s+to|(?:ceremon(?:y|ies)|services?|worship|prayers?)\s+(?:were\s+)?cancel(?:led|ed)|בלי\s+קהל|ללא\s+נוכחות\s+ציבור|סגור(?:ים|ות)?\s+בשל)/i;

/** Ritual clearly continued with meaningful public participation. */
const RITUAL_CONTINUED_RE =
  /(?:with\s+public\s+attendance|thousands\s+(?:of\s+)?(?:worshipers|pilgrims|attendees|faithful)|(?:ceremony|ritual|holiday|festival)\s+(?:went\s+ahead|proceeded|continued\s+as\s+usual|held\s+as\s+usual)|held\s+as\s+usual|משתתפים רבים)/i;

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

  if (COMMUNITY_BACKBONE_GAP_RE.test(text)) {
    if (type === 'institutional_abandonment_perception' || type === 'resource_shortage') {
      return 'coordination_failure';
    }
  }

  if (
    RITUAL_CONTINUITY_TYPES.has(type)
    && RITUAL_ACCESS_DISRUPTED_RE.test(text)
    && !RITUAL_CONTINUED_RE.test(text)
  ) {
    return 'service_disruption';
  }

  return type;
}

/** Clause describes civilian physical injury, not building damage. */
const POPULATION_HARM_CLAUSE_RE =
  /(?:בני\s+אדם|אנשים|תינוק(?:ות)?|ילד(?:ה|ים)\s+נפצע|נפגעים|נפצעו|פצועים|הרוג|נפגע\s+בגוף|injured|wounded|killed|casualties)/i;

/** Clause describes physical damage to structures or infrastructure. */
const INFRA_DAMAGE_CLAUSE_RE =
  /(?:גן(?:י)?(?:\s+ילדים)?|בתי\s+ספר|בית\s+ספר|מבנה|בניין|דיר(?:ה|ות)|תשתית|כביש|חשמל|מפעל|kindergarten|school|building|infrastructure).{0,80}?(?:ניזוק|נפגע(?:ו)?|נהרס|destroyed|damaged|hit)|(?:ניזוק|נזק\s+(?:כבד\s+)?נגרם).{0,50}?(?:גן|בית\s+ספר|מבנה|בניין|דירה)/i;

/**
 * @param {string} evidence
 * @returns {string[]}
 */
export function splitEvidenceClauses(evidence) {
  const text = String(evidence ?? '').trim();
  if (!text) return [];
  const parts = text
    .split(
      /\s*(?<=[.!?])\s+|\s*,\s+(?=גן\s|בית\s+ספר|בתי\s+ספר|מבנה|בניין)|\s*;\s+|\s+במקביל[,،]?\s+/u,
    )
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
  const hasInfra = INFRA_DAMAGE_CLAUSE_RE.test(text);
  const hasHarm = POPULATION_HARM_CLAUSE_RE.test(text);
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
const BARE_ALERT_ACTIVATION_RE =
  /(?:אזעק(?:ה|ות).{0,120}(?:הופעל|הושמע|נשמע|התריע)|התרע(?:ה|ות).{0,80}(?:הופעל|נשמע|ניתנ)|alerts?\s+(?:were\s+)?(?:activated|sounded)|sirens?\s+(?:were\s+)?(?:activated|sounded)|(?:ירי|שיגור).{0,40}(?:טיל|רקט)(?:ים|ות)?)/i;

/** Resident behavior, coping, or distinct outcome — keep even when alerts are mentioned. */
const RESILIENCE_BEHAVIORAL_CONTENT_RE =
  /(?:תושבים|נכנס|יצא|מקלט|ממר״|ממ"ד|שגרה|פתוח|סגור|נפצע|ניזוק|נפגע|ילד|בית\s+ספר|עבודה|מסחר|למודים|התעלמ|לא\s+נכנס|חזרו|compliance|shelter|residents?|routine|shops?|school|movement\s+of|emergency\s+routine|no\s+vehicles|empty\s+street|נפילה|פגיעה|התפוצצ)/i;

/**
 * @param {string} evidence
 * @returns {boolean}
 */
export function isBareHazardTickerEvidence(evidence) {
  const text = String(evidence ?? '');
  if (!BARE_ALERT_ACTIVATION_RE.test(text)) return false;
  return !RESILIENCE_BEHAVIORAL_CONTENT_RE.test(text);
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
