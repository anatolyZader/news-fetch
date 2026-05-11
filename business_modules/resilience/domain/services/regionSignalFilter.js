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
];

function isNorthFromResolvedGeo(signal) {
  const g = signal?.geo;
  if (!g || g.kind !== 'resolved') return false;
  // Explicit low-confidence / non-metrics geo must not count as verified north from geo alone.
  if (Object.prototype.hasOwnProperty.call(g, 'usableForMetrics') && g.usableForMetrics === false) {
    return false;
  }
  if (Array.isArray(g.geoAreaTags) && g.geoAreaTags.includes('north')) return true;
  const id = String(g.pboSubregionId ?? g.subregionId ?? '').trim().toLowerCase();
  return ['naftali', 'golan', 'baram', 'hiram', 'galma'].includes(id);
}

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

export function isNorthSignal(signal) {
  if (ALWAYS_NORTH_SOURCE_TYPES.has(signal?.source_type)) return true;
  if (isNorthFromResolvedGeo(signal)) return true;
  const haystack = haystackForSignal(signal);
  return NORTH_TERMS.some((term) => haystack.includes(term.toLowerCase()));
}

export function filterSignalsForScope(signals, scope) {
  if (scope === 'north') return signals.filter(isNorthSignal);
  return signals;
}

export function normalizeReportScope(scope) {
  return scope === 'north' ? 'north' : 'national';
}

export function reportScopeMetadata(scope) {
  return normalizeReportScope(scope) === 'north'
    ? { id: 'north', label: 'Northern Israel', comparison_scope: 'national' }
    : { id: 'national', label: 'National' };
}
