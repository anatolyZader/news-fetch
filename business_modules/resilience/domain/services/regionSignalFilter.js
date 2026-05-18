import { northRelevanceFromResolvedGeo } from '../../../../cross-cut-modules/geo/northRelevanceFromResolvedGeo.js';

const ALWAYS_NORTH_SOURCE_TYPES = new Set(['field', 'pbo', 'pbo_regional', 'naftali', 'whatsapp']);

const NORTH_TERMS = [
  // English
  'north',
  'northern',
  'northern israel',
  'galilee',
  'upper galilee',
  'western galilee',
  'golan',
  'golan heights',
  'haifa',
  'acre',
  'akko',
  'nahariya',
  'kiryat shmona',
  'kiryat shemona',
  'metula',
  'shlomi',
  'safed',
  'tzfat',
  'tiberias',
  'karmiel',
  'katzrin',
  'tamra',
  'majdal shams',
  'hula',
  'jezreel',
  'yokneam',
  'afula',
  'beit shean',
  'nazareth',
  'nazereth',
  'migdal',
  'hurfeish',
  'deir hanna',
  'abu snan',
  'julis',
  'yirka',
  'kfar kama',
  'kfar manda',
  'majdal al-krum',
  'jadeidi-makr',
  'i\'billin',
  'ibillin',

  // Hebrew
  'צפון',
  'צפוני',
  'צפונית',
  'צפונ',
  'גליל',
  'הגליל',
  'גליל עליון',
  'גליל מערבי',
  'גולן',
  'רמת הגולן',
  'חיפה',
  'עכו',
  'נהריה',
  'קריית שמונה',
  'קרית שמונה',
  'מטולה',
  'שלומי',
  'צפת',
  'טבריה',
  'כרמיאל',
  'קצרין',
  'טמרה',
  'מג׳דל שמס',
  'מג\'דל שמס',
  'עמק החולה',
  'עמק יזרעאל',
  'יוקנעם',
  'עפולה',
  'בית שאן',
  'נצרת',
  'מגדל',
  'חורפיש',
  'דיר חנא',
  'אבו סנאן',
  'ג׳וליס',
  'ג\'וליס',
  'ירכא',
  'כפר כמא',
  'כפר מנדא',
  'מג׳ד אל-כרום',
  'מג\'ד אל-כרום',
  'ג׳דיידה מכר',
  'ג\'דיידה מכר',
  'אעבלין',

  // From north-reference.json (sync-north-terms-from-reference.mjs)
  'bu\'eine nujeidat',
  'golan regional council',
  'qiryat shemona',
  'בועינה - נוג\'ידת',
  'בועינה נוג\'ידת',
  'בוקעאתא',
  'בית ג\'ן',
  'גליל תחתון',
  'דיר אל אסד',
  'טובא-זנגריה',
  'יאנוח-ג\'ת',
  'יבנאל',
  'יסוד המעלה',
  'כסרא סמיע',
  'כפר ורדים',
  'כפר יאסיף',
  'מגאר',
  'גוש חלב',
  'ג\'ש (גוש חלב)',
];

function haystackForSignal(signal) {
  return [
    signal?.evidence,
    signal?.article_source,
    signal?.article_title,
    signal?.article_url,
    signal?.source_file,
    signal?.municipality,
    signal?.region,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/**
 * Explainable north-relevance decision trace.
 * @param {object} signal
 * @returns {{ isNorthRelevant: boolean, source: string, confidence: 'high'|'medium'|'low', reasons: string[] }}
 */
export function scopeDecisionForSignal(signal) {
  const reasons = [];
  if (ALWAYS_NORTH_SOURCE_TYPES.has(signal?.source_type)) {
    reasons.push(`source_type=${signal?.source_type}`);
    return { isNorthRelevant: true, source: 'source_type', confidence: 'high', reasons };
  }
  const g = signal?.geo;
  if (g?.kind === 'resolved') {
    const geoNorth = northRelevanceFromResolvedGeo(g);
    if (geoNorth.isNorthRelevant) {
      return {
        isNorthRelevant: true,
        source: geoNorth.source,
        confidence: geoNorth.confidence,
        reasons: [...geoNorth.reasons],
      };
    }
    // usableForMetrics=false: do not count geo as verified north, but allow keyword_fallback below.
  }
  const haystack = haystackForSignal(signal);
  if (NORTH_TERMS.some((term) => haystack.includes(term.toLowerCase()))) {
    reasons.push('keyword_fallback');
    return { isNorthRelevant: true, source: 'keyword_fallback', confidence: 'low', reasons };
  }
  return { isNorthRelevant: false, source: 'unknown', confidence: 'low', reasons };
}

export function isNorthSignal(signal) {
  return scopeDecisionForSignal(signal).isNorthRelevant;
}

export function filterSignalsForScope(signals, scope) {
  const out = (signals ?? []).map((s) => {
    const d = scopeDecisionForSignal(s);
    return s && typeof s === 'object' ? { ...s, scopeDecision: d } : s;
  });
  if (scope === 'north') return out.filter((s) => s?.scopeDecision?.isNorthRelevant);
  return out;
}

export function normalizeReportScope(scope) {
  return scope === 'north' ? 'north' : 'national';
}

export function reportScopeMetadata(scope) {
  return normalizeReportScope(scope) === 'north'
    ? { id: 'north', label: 'Northern Israel', comparison_scope: 'national' }
    : { id: 'national', label: 'National' };
}
