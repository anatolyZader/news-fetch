import { google } from 'googleapis';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve the key file from an absolute path so GCP metadata service is bypassed
const KEY_FILE = resolve(__dirname, '../../../../secrets/service-account.json');

const SPREADSHEET_ID = '1GR93UR1TyJRsb9hvWvdbbuddrj4EEupNVIolpG7nD1I';
const SHEET_GID = '984363915';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Map English keys to Hebrew substrings found in column headers
const COL_MATCHERS = {
  timestamp:           ['timestamp', 'חותמת'],
  settlement:          ['יישוב'],
  activityCount:       ['מספר הפעילויות', 'הסדנאות'],
  childrenCount:       ['סך כל הילדים', 'מספר הילדים'],
  ageRanges:           ['טווח גילאי'],
  activityType:        ['סוג הפעילות'],
  activityHours:       ['שעות הפעילות'],
  copingLevel:         ['מתמודדים עם מצב החירום'],
  streetMovement:      ['תנועה של אנשים'],
  informalContactFreq: ['מחוץ לשעות הפעילות הפורמלית'],
  communityActivities: ['פעילויות קהילתיות או חינוכיות', 'מלבד הפעילות שאתה מעביר'],
  concerningTrends:    ['הבחנת בקרב הילדים והנוער', 'מהתופעות הבאות'],
  exposureMethod:      ['איך נחשפת', 'נחשפת אליהן'],
  interventionNeeded:  ['צריך להתערב'],
  openComment:         ['עוד משהו'],
};

// Normalize Hebrew answer values to stable English keys
function normalizeAgeRange(v) {
  if (v.includes('פעוטות') || v.includes('1-3'))   return 'toddlers';
  if (v.includes('גיל גן') || v.includes('גן') && v.includes('3-6')) return 'kindergarten';
  if (v.includes('שמרטפ'))                         return 'kindergarten';
  if (v.includes('יסודי'))                          return 'elementary';
  if (v.includes('חטיבה') || v.includes('עליונה'))   return 'highschool';
  return v.trim();
}

// activityType options contain commas so we scan the whole cell value
function extractActivityTypes(val) {
  if (!val) return [];
  const types = [];
  if (val.includes('חינוכית') || val.includes('הוראה')) types.push('educational');
  if (val.includes('הפגה'))                             types.push('relief');
  if (!types.length && val.trim()) types.push('other');
  return types;
}

function normalizeTrend(v) {
  if (v.includes('סמים'))                              return 'drugs';
  if (v.includes('אלכוהול'))                           return 'alcohol';
  if (v.includes('אלימות פיזית'))                      return 'physical_violence';
  if (v.includes('אלימות מילולית'))                    return 'verbal_violence';
  if (v.includes('אלימות'))                            return 'physical_violence';
  if (v.includes('מסכים'))                             return 'screens';
  if (v.includes('בדידות') || v.includes('הימנעות'))   return 'loneliness';
  if (v.includes('לא הבחנתי'))                         return 'none_observed';
  return v.trim();
}

function normalizeExposure(v) {
  if (v.includes('במו עיניי'))       return 'witnessed';
  if (v.includes('קבוצת ילדים'))     return 'group_shared';
  if (v.includes('הילד') || v.includes('הנער')) return 'child_shared';
  if (v.includes('מבוגר') || v.includes('הורה')) return 'adult_shared';
  return 'other';
}

function normalizeIntervention(v) {
  if (!v) return 'unknown';
  if (v.includes('כן'))    return 'yes';
  if (v.includes('לא'))    return 'no';
  if (v.includes('אולי'))  return 'maybe';
  return v.trim();
}

export function normalizeCoping(v) {
  if (!v) return 'other';
  if (v.includes('אדישים'))                   return 'indifferent';
  if (v.includes('מתמודדים די בקלות'))        return 'coping_easily';
  if (v.includes('קצת מתקשים'))              return 'struggling_somewhat';
  if (v.includes('מתקשים מאוד'))             return 'struggling_greatly';
  return 'other';
}

export function normalizeFreq(v) {
  if (!v) return 'unknown';
  if (v.includes('גבוהה')) return 'high';
  if (v.includes('נמוכה')) return 'low';
  if (v.includes('כמעט'))  return 'rarely';
  return v.trim();
}

// Return ALL column indices matching any matcher (handles duplicate question sets)
function findCols(headers, matchers) {
  return headers.reduce((acc, h, i) => {
    if (matchers.some(m => h.toLowerCase().includes(m.toLowerCase()))) acc.push(i);
    return acc;
  }, []);
}

// Pick first non-empty value across all matching columns
function firstNonEmpty(row, indices) {
  for (const i of indices) {
    const v = row[i];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function splitMulti(val) {
  if (!val || typeof val !== 'string') return [];
  return val.split(', ').map(v => v.trim()).filter(Boolean);
}

function parseRow(row, colMap) {
  const get = (k) => firstNonEmpty(row, colMap[k]);
  const timestamp = get('timestamp');
  const date = timestamp ? new Date(timestamp).toISOString().split('T')[0] : null;

  return {
    timestamp,
    date,
    settlement:           get('settlement').trim(),
    activityCount:        parseInt(get('activityCount'), 10) || 0,
    childrenCount:        parseInt(get('childrenCount'), 10) || 0,
    ageRanges:            splitMulti(get('ageRanges')).map(normalizeAgeRange),
    activityType:         extractActivityTypes(get('activityType')),
    activityHours:        splitMulti(get('activityHours')),
    copingLevel:          normalizeCoping(get('copingLevel')),
    streetMovement:       normalizeFreq(get('streetMovement')),
    informalContactFreq:  normalizeFreq(get('informalContactFreq')),
    communityActivities:  get('communityActivities').trim(),
    concerningTrends:     splitMulti(get('concerningTrends')).map(normalizeTrend),
    exposureMethod:       splitMulti(get('exposureMethod')).map(normalizeExposure),
    interventionNeeded:   normalizeIntervention(get('interventionNeeded')),
    openComment:          get('openComment').trim(),
  };
}

let _cache = null;
let _cacheTime = 0;

export async function fetchEducationSessions({ forceRefresh = false } = {}) {
  if (!forceRefresh && _cache && Date.now() - _cacheTime < CACHE_TTL_MS) {
    return _cache;
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: KEY_FILE,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  const sheets = google.sheets({ version: 'v4', auth });

  // Resolve sheet name from gid
  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const sheetMeta = meta.data.sheets.find(
    s => String(s.properties.sheetId) === SHEET_GID
  );
  const sheetName = sheetMeta?.properties?.title ?? 'Form Responses 1';

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: sheetName,
  });

  const values = res.data.values ?? [];
  if (values.length < 2) {
    _cache = [];
    _cacheTime = Date.now();
    return _cache;
  }

  const [headers, ...dataRows] = values;

  const colMap = {};
  for (const [key, matchers] of Object.entries(COL_MATCHERS)) {
    colMap[key] = findCols(headers, matchers);
  }

  _cache = dataRows
    .filter(row => row.length > 1)
    .map(row => parseRow(row, colMap))
    .filter(s => s.date);
  _cacheTime = Date.now();

  return _cache;
}
