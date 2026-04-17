/**
 * Per-component evidence requirements for the adaptive WhatsApp bot.
 *
 * The 8 componentIds match RESILIENCE_COMPONENTS exactly. For each we declare:
 *   required         — fields that must be present before the bot may transition to `drafting`.
 *   optional         — fields that strengthen the report but are not blocking.
 *   disambiguation   — dimensions where multiple plausible drivers should be distinguished.
 *   confounders      — alternative explanations worth probing before accepting the dominant interpretation.
 *   fallbackQuestions — short Hebrew questions to ask when the LLM did not return topQuestions.
 *
 * The closed vocabularies live next to the config so that:
 *   - the prompt emits only allowed values,
 *   - the gap engine can validate them.
 */

// ── Closed vocabularies ────────────────────────────────────────────────────

export const SPREAD_VALUES = ['isolated', 'noticeable', 'widespread'];
export const SOURCE_BASIS_VALUES = ['direct', 'staff', 'residents', 'mixed'];
export const DIRECTION_VALUES = ['positive', 'negative', 'mixed'];
export const COMPARISON_VALUES = ['new', 'stable', 'worsening', 'improving'];
export const CONFIDENCE_LEVELS = ['low', 'medium', 'high'];

// ── Shared requirement baselines ───────────────────────────────────────────

const COMMON_REQUIRED = ['observedBehavior', 'locality', 'sourceBasis', 'spread'];
const COMMON_OPTIONAL = ['timeframe', 'comparisonToPrior', 'affectedPopulation'];

// ── Per-component requirements (all 8 components covered) ─────────────────

export const EVIDENCE_REQUIREMENTS = {
  narrative: {
    componentId: 'narrative',
    required: [...COMMON_REQUIRED, 'narrativeContent'],
    optional: [...COMMON_OPTIONAL, 'competingNarratives', 'credibilitySignal'],
    disambiguation: [
      { dimension: 'framing', values: ['endurance', 'futility', 'mixed', 'other'] },
    ],
    confounders: ['media_framing', 'partisan_spin', 'single_actor_statement'],
    fallbackQuestions: [
      'מה הסיפור הדומיננטי שתושבים מספרים על האירוע?',
      'האם יש סיפורים מתחרים (למשל "יש תכלית" מול "המחיר גבוה מדי")?',
      'האם התושבים תופסים את הסיפור הרשמי כאמין ורלוונטי?',
    ],
  },

  information_communication: {
    componentId: 'information_communication',
    required: [...COMMON_REQUIRED, 'whichChannel'],
    optional: [...COMMON_OPTIONAL, 'guidanceMatchesReality', 'rumorContent', 'accessibilityConcern'],
    disambiguation: [
      { dimension: 'gap_type', values: ['unclear', 'inaccessible', 'contradictory', 'rumor', 'actionable_but_ignored', 'other'] },
    ],
    confounders: ['language_barrier', 'no_nearby_shelter', 'shift_work_constraints'],
    fallbackQuestions: [
      'דרך איזה ערוץ תושבים מקבלים את המידע — פיקוד העורף, רשויות, מדיה, רשתות?',
      'האם ההנחיות ברורות ומתאימות למציאות של התושבים?',
      'האם מסתובבות שמועות או מידע סותר?',
    ],
  },

  lifesaving_behavior: {
    componentId: 'lifesaving_behavior',
    required: [...COMMON_REQUIRED],
    optional: [...COMMON_OPTIONAL, 'subgroup', 'authorityResponse', 'threatPerception'],
    disambiguation: [
      { dimension: 'driver', values: ['fatigue', 'disbelief', 'access', 'distrust', 'practical', 'other'] },
    ],
    confounders: ['false_alarm_fatigue', 'shelter_inaccessibility', 'scheduled_closure', 'special_event'],
    fallbackQuestions: [
      'האם זו תצפית ישירה שלך, דיווח מצוות מקומי, או מה שתושבים סיפרו?',
      'זו התנהגות של מעט תושבים, של שכונה/רחוב, או תופעה רחבה?',
      'מה הגורם הדומיננטי לפי התושבים — עייפות, חוסר אמון באיום, קושי גישה, או משהו אחר?',
      'האם זה שונה מהשבוע שעבר?',
    ],
  },

  functional_continuity: {
    componentId: 'functional_continuity',
    required: [...COMMON_REQUIRED, 'continuityType'],
    optional: [...COMMON_OPTIONAL, 'disruptionCause', 'returnToRoutineSignal'],
    disambiguation: [
      { dimension: 'continuityType', values: ['work', 'school', 'commerce', 'services', 'social_roles', 'mixed', 'other'] },
    ],
    confounders: ['holiday_closure', 'pre_existing_disruption', 'infrastructure_unrelated_to_event'],
    fallbackQuestions: [
      'באיזה תחום יש שיבוש — עבודה, לימודים, מסחר, שירותים חיוניים, או חיי חברה?',
      'האם בתי הספר והמוסדות פתוחים כרגיל?',
      'מה הגורם הישיר לשיבוש — המצב הביטחוני, מחסור, או משהו אחר?',
    ],
  },

  community_capital: {
    componentId: 'community_capital',
    required: [...COMMON_REQUIRED, 'organizationOrVolunteers'],
    optional: [...COMMON_OPTIONAL, 'coordinationMechanism', 'crossSectorCooperation'],
    disambiguation: [
      { dimension: 'initiator', values: ['municipality', 'ngo', 'residents', 'businesses', 'mixed', 'other'] },
    ],
    confounders: ['one_off_initiative', 'pre_existing_org_unrelated_to_event'],
    fallbackQuestions: [
      'מי מוביל את הפעילות — העירייה, עמותה, תושבים, עסקים, או שילוב?',
      'האם יש מנגנון תיאום בין הארגונים השונים?',
      'כמה תושבים/גורמים מעורבים?',
    ],
  },

  leadership: {
    componentId: 'leadership',
    required: [...COMMON_REQUIRED, 'leaderRole'],
    optional: [...COMMON_OPTIONAL, 'trustSignal', 'publicExample'],
    disambiguation: [
      { dimension: 'leaderRole', values: ['formal_official', 'religious', 'informal_community', 'spiritual', 'other'] },
      { dimension: 'trustSignal', values: ['trust', 'criticism', 'indifference', 'mixed'] },
    ],
    confounders: ['personal_political_dispute', 'single_vocal_critic', 'pre_existing_grievance'],
    fallbackQuestions: [
      'במי בדיוק מדובר — ראש הרשות, רב, מנהיג קהילתי, או מישהו אחר?',
      'תושבים מביעים אמון, ביקורת, או שילוב?',
      'האם המנהיגות נוכחת פיזית ונותנת הנחיות פעילות?',
    ],
  },

  belonging_solidarity: {
    componentId: 'belonging_solidarity',
    required: [...COMMON_REQUIRED],
    optional: [...COMMON_OPTIONAL, 'mutualAidExamples', 'excludedGroup'],
    disambiguation: [
      { dimension: 'tone', values: ['solidarity', 'scapegoating', 'indifference', 'mixed', 'other'] },
    ],
    confounders: ['single_incident', 'pre_existing_intercommunal_tension'],
    fallbackQuestions: [
      'האם יש דוגמאות קונקרטיות של עזרה הדדית בין תושבים?',
      'האם יש קבוצה שמרגישה מודרת או מואשמת במצב?',
      'מה התחושה הרווחת — "כולנו באותה סירה" או פיצול?',
    ],
  },

  wellbeing_atrisk: {
    componentId: 'wellbeing_atrisk',
    required: [...COMMON_REQUIRED, 'vulnerableGroup'],
    optional: [...COMMON_OPTIONAL, 'responseType', 'unmetNeeds'],
    disambiguation: [
      { dimension: 'vulnerableGroup', values: ['elderly', 'disabled', 'children', 'evacuees', 'minorities', 'mentally_distressed', 'other'] },
      { dimension: 'responseType', values: ['emotional', 'physical', 'informational', 'logistical', 'mixed', 'absent'] },
    ],
    confounders: ['pre_existing_chronic_need', 'individual_case_only'],
    fallbackQuestions: [
      'על איזו קבוצה מדובר — קשישים, אנשים עם מוגבלות, ילדים, מפונים, מיעוטים, או אחר?',
      'האם קיים מענה מותאם — רגשי, פיזי, מידע, או לוגיסטי?',
      'האם דווח על צרכים שלא נענו?',
    ],
  },
};

export const COMPONENT_IDS = Object.keys(EVIDENCE_REQUIREMENTS);

/**
 * Structured fields that apply to ALL components. A sufficient report needs these
 * regardless of which component(s) it touches.
 */
export const UNIVERSAL_REQUIRED = [...COMMON_REQUIRED];

/**
 * Lookup helper.
 */
export function getRequirements(componentId) {
  return EVIDENCE_REQUIREMENTS[componentId] ?? null;
}
