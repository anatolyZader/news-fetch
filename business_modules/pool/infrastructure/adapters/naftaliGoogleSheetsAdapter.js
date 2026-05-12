import { google } from 'googleapis';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KEY_FILE = resolve(__dirname, '../../../../secrets/service-account.json');

const SPREADSHEET_ID = '16YjWc1K2Qh0JmyGCHRW0FxEtZn1HQcFsc-jsrHuCA7M';
const SHEET_GID = '1275318634';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Map severity Hebrew text to normalized keys
function normalizeSeverity(val) {
  if (!val || typeof val !== 'string') return 'unknown';
  const v = val.trim();
  if (/גבוה|רבה|הרבה/i.test(v)) return 'high';
  if (/בינונ/i.test(v)) return 'medium';
  if (/נמוכ|מעט/i.test(v)) return 'low';
  if (/לא יד|לא ידוע/i.test(v)) return 'unknown';
  if (/^כן\s*$/i.test(v)) return 'high';
  if (/^לא\s*$/i.test(v)) return 'none';
  if (v.length > 20) return 'qualitative';
  return 'unknown';
}

// Column header substrings → field keys
const COL_MATCHERS = {
  timestamp:             ['חותמת זמן'],
  respondentName:        ['שם ממלא הטופס'],
  municipality:          ['שם רשות'],
  welfareContact:        ['שם מנהל/ת מחלקת רווחה', 'מנהל מחלקת רווחה'],
  physicalDisability:    ['מוגבלות פיזית'],
  mentalDisability:      ['מוגבלות נפשית'],
  specialEducation:      ['חינוך מיוחד'],
  domesticViolence:      ['אלימות במשפחה'],
  severeFinancial:       ['קושי כלכלי חמור'],
  singleParent:          ['חד-הוריות', 'חד הוריות'],
  evacuatedFamilies:     ['התפנו מהרשות'],
  arrivedFamilies:       ['הגיעו לרשות'],
  financialRequests:     ['פניות של קושי כלכלי'],
  schoolMentalHealth:    ['עזרה נפשית בקרב תלמידי'],
  communityMentalHealth: ['עזרה נפשית ברשות'],
  parentalStress:        ['עומס על ההורים'],
  coupleConflicts:       ['קשיים בין בני זוג'],
  parentChildConflicts:  ['קשיים בין הורים לילדים'],
  vulnerableGroups:      ['הקשיים בולטים במיוחד'],
  staffShortage:         ['מחסור בכוח אדם', 'עומס חריג במחלקה'],
  responseTimeImpact:    ['משפיע על זמני המענה'],
  volunteerInitiatives:  ['יוזמות ההתנדבויות'],
  volunteerNeeds:        ['צורך משמעותי בסיוע התנדבותי'],
  volunteerCoordination: ['תיאום והעבודה המשותפת'],
  mainChallenge:         ['האתגר המרכזי'],
  urgentNeeds:           ['הצרכים הדחופים'],
  additionalComments:    ['רוצים להוסיף'],
};

function findCols(headers, matchers) {
  return headers.reduce((acc, h, i) => {
    if (matchers.some(m => h.includes(m))) acc.push(i);
    return acc;
  }, []);
}

function firstNonEmpty(row, indices) {
  for (const i of indices) {
    const v = row[i];
    if (v && String(v).trim()) return String(v).trim();
  }
  return '';
}

function parseTimestamp(val) {
  if (!val) return null;
  // DD/MM/YYYY HH:MM:SS or DD/MM/YYYY
  const m = val.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  // Fallback: try native parse
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
}

function parseRow(row, colMap) {
  const get = (k) => firstNonEmpty(row, colMap[k] ?? []);

  const timestamp = get('timestamp');
  const date = parseTimestamp(timestamp);

  const vulnerable = {
    physicalDisability: parseInt(get('physicalDisability'), 10) || 0,
    mentalDisability:   parseInt(get('mentalDisability'),   10) || 0,
    specialEducation:   parseInt(get('specialEducation'),   10) || 0,
    domesticViolence:   parseInt(get('domesticViolence'),   10) || 0,
    severeFinancial:    parseInt(get('severeFinancial'),    10) || 0,
    singleParent:       parseInt(get('singleParent'),       10) || 0,
  };

  const severity = {
    financialRequests:     normalizeSeverity(get('financialRequests')),
    schoolMentalHealth:    normalizeSeverity(get('schoolMentalHealth')),
    communityMentalHealth: normalizeSeverity(get('communityMentalHealth')),
    parentalStress:        normalizeSeverity(get('parentalStress')),
    coupleConflicts:       normalizeSeverity(get('coupleConflicts')),
    parentChildConflicts:  normalizeSeverity(get('parentChildConflicts')),
  };

  const freeText = {
    vulnerableGroups:      get('vulnerableGroups'),
    staffShortage:         get('staffShortage'),
    responseTimeImpact:    get('responseTimeImpact'),
    volunteerInitiatives:  get('volunteerInitiatives'),
    volunteerNeeds:        get('volunteerNeeds'),
    volunteerCoordination: get('volunteerCoordination'),
    mainChallenge:         get('mainChallenge'),
    urgentNeeds:           get('urgentNeeds'),
    additionalComments:    get('additionalComments'),
  };

  return {
    timestamp,
    date,
    municipality: get('municipality').trim(),
    respondent:   get('respondentName').trim(),
    vulnerable,
    evacuated: get('evacuatedFamilies'),
    arrived:   get('arrivedFamilies'),
    severity,
    freeText,
  };
}

let _cache = null;
let _cacheTime = 0;

export async function fetchNaftaliResponses({ forceRefresh = false } = {}) {
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
    .filter(s => s.date && s.municipality);
  _cacheTime = Date.now();

  return _cache;
}
