import { google } from 'googleapis';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Resolve the key file from an absolute path so GCP metadata service is bypassed
const KEY_FILE = resolve(__dirname, '../../../secrets/service-account.json');

const SPREADSHEET_ID = '1GR93UR1TyJRsb9hvWvdbbuddrj4EEupNVIolpG7nD1I';
const SHEET_GID = '984363915';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Map English keys to Hebrew substrings found in column headers
const COL_MATCHERS = {
  timestamp:           ['timestamp', 'חותמת'],
  settlement:          ['יישוב'],
  childrenCount:       ['מספר הילדים'],
  ageRanges:           ['טווח גילאי'],
  activityType:        ['סוג הפעילות'],
  activityHours:       ['שעות הפעילות'],
  copingLevel:         ['מתמודדים עם מצב החירום'],
  copingExpression:    ['ביטוי', 'התמודדות קיבלה'],
  streetMovement:      ['תנועה של אנשים'],
  residentRelationship:['קשר שלך עם התושבים'],
  informalContactFreq: ['מחוץ לשעות הפעילות הפורמלית'],
  interruptionFreq:    ['הופסקה בעקבות'],
  concerningTrends:    ['עלייה באחת'],
  openComment:         ['עוד משהו'],
};

// Normalize Hebrew answer values to stable English keys
function normalizeAgeRange(v) {
  if (v.includes('שמרטפ'))                       return 'nursery';
  if (v.includes('יסודי'))                        return 'elementary';
  if (v.includes('חטיבה') || v.includes('עליונה')) return 'highschool';
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

function normalizeExpression(v) {
  if (v.includes('התנהגות'))  return 'behavior';
  if (v.includes('שיח'))      return 'discourse';
  if (v.includes('שיתוף'))    return 'cooperation';
  return v.trim();
}

function normalizeTrend(v) {
  if (v.includes('סמים'))    return 'drugs';
  if (v.includes('אלכוהול')) return 'alcohol';
  if (v.includes('אלימות'))  return 'violence';
  if (v.includes('מסכים'))   return 'screens';
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
    childrenCount:        parseInt(get('childrenCount'), 10) || 0,
    ageRanges:            splitMulti(get('ageRanges')).map(normalizeAgeRange),
    activityType:         extractActivityTypes(get('activityType')),
    activityHours:        splitMulti(get('activityHours')),
    copingLevel:          normalizeCoping(get('copingLevel')),
    copingExpression:     splitMulti(get('copingExpression')).map(normalizeExpression),
    streetMovement:       normalizeFreq(get('streetMovement')),
    residentRelationship: get('residentRelationship').trim(),
    informalContactFreq:  normalizeFreq(get('informalContactFreq')),
    interruptionFreq:     normalizeFreq(get('interruptionFreq')),
    concerningTrends:     splitMulti(get('concerningTrends')).map(normalizeTrend),
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
