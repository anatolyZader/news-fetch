/**
 * Service to parse PBO municipality Excel reports and return structured 8-component data.
 * Each Excel file contains one day's PBO reports for all municipalities in a district.
 *
 * Columns are alphabetically sorted (Hebrew) by the export tool — we map them back
 * to the 8 resilience components using header text matching.
 */

import { readFileSync, readdirSync } from 'fs';
import { resolve, basename } from 'path';
import XLSX from 'xlsx';

// ─── Column → component mapping ─────────────────────────────────────────────
// Each entry: { pattern: substring to match in Hebrew header, component, kind: 'score'|'text' }
const COLUMN_MAP = [
  // Score columns
  { pattern: 'ממצה משאבי קהילה',                      component: 'community_capital',          kind: 'score' },
  { pattern: 'תופסת את המידע בכלי התקשורת הארציים',   component: 'information_communication',  kind: 'score' },
  { pattern: 'מעודדת את תושביה לפעול לפי הנחיות',     component: 'leadership',                 kind: 'score' },
  { pattern: 'מקדמת נרטיב המעודד התמודדות',            component: 'narrative',                  kind: 'score' },
  { pattern: 'נתפסת כמקור תמיכה של האוכלוסייה',       component: 'leadership',                 kind: 'score' },
  { pattern: 'מכירים ומבינים את הנחיות פיקוד העורף',   component: 'lifesaving_behavior',        kind: 'score' },
  { pattern: 'מצליחים לנהל חיי שגרה',                  component: 'functional_continuity',      kind: 'score' },
  { pattern: 'מקבלים את המידע המקומי הנדרש',           component: 'information_communication',  kind: 'score' },
  { pattern: 'שמספקים להם את השירותים הנדרשים',        component: 'functional_continuity',      kind: 'score' },
  { pattern: 'סומכים על המידע שהם מקבלים מהרשות',     component: 'information_communication',  kind: 'score' },
  { pattern: 'פועלים הלכה למעשה על פי ההנחיות',        component: 'lifesaving_behavior',        kind: 'score' },
  { pattern: 'תופסים את הנרטיב המוצג על ידי הנהגת',   component: 'narrative',                  kind: 'score' },
  { pattern: 'נרטיב של התמודדות מוצלחת בקרב',         component: 'narrative',                  kind: 'score' },
  { pattern: 'מענים מספקים לצורכי האוכלוסיות המיוחדות', component: 'wellbeing_atrisk',           kind: 'score' },
  { pattern: 'יוזמות של סיוע הדדי',                    component: 'belonging_solidarity',       kind: 'score' },
  { pattern: 'קבוצות אוכלוסייה הנתפסות כמחוץ למחנה',  component: 'belonging_solidarity',       kind: 'score', invert: true },
  { pattern: 'מנגנוני המידע והתקשורת של הרשות מותאמים', component: 'information_communication', kind: 'score' },
  { pattern: 'פעילות לאיתור אוכלוסיות מעגל שני',       component: 'wellbeing_atrisk',           kind: 'score' },
  { pattern: 'סיפור ההתמודדות המרכזי משקף',            component: 'narrative',                  kind: 'score' },
  { pattern: 'מנגנונים לתכלול פעילות המתנדבים',        component: 'community_capital',          kind: 'score' },
  { pattern: 'מענים רגשיים עבור תושבים המגלים סימני',  component: 'wellbeing_atrisk',           kind: 'score' },
  { pattern: 'נכונות בקרב התושבים להתנדב',             component: 'community_capital',          kind: 'score' },
  { pattern: 'תחושת סולידריות בקרב התושבים',           component: 'belonging_solidarity',       kind: 'score' },
  { pattern: 'תפיסת האיום של התושבים מקדמת',           component: 'lifesaving_behavior',        kind: 'score' },

  // Free text columns (התייחסות מילולית = verbal reference)
  { pattern: 'התייחסות מילולית דאגה לרווחה',            component: 'wellbeing_atrisk',           kind: 'text' },
  { pattern: 'התייחסות מילולית התנהגות אפקטיבית',       component: 'lifesaving_behavior',        kind: 'text' },
  { pattern: 'התייחסות מילולית מידע ותקשורת',           component: 'information_communication',  kind: 'text' },
  { pattern: 'התייחסות מילולית מיצוי משאבי קהילה',      component: 'community_capital',          kind: 'text' },
  { pattern: 'התייחסות מילולית מנהיגות',                component: 'leadership',                 kind: 'text' },
  { pattern: 'התייחסות מילולית נרטיב',                  component: 'narrative',                  kind: 'text' },
  { pattern: 'התייחסות מילולית רציפות תפקודית',         component: 'functional_continuity',      kind: 'text' },
  { pattern: 'התייחסות מילולית שייכות וסולידריות',       component: 'belonging_solidarity',       kind: 'text' },
];

const COMPONENTS_ORDER = [
  'narrative', 'information_communication', 'lifesaving_behavior',
  'functional_continuity', 'community_capital', 'leadership',
  'belonging_solidarity', 'wellbeing_atrisk',
];

const COMPONENT_NAMES_HE = {
  narrative:                 'נרטיב',
  information_communication: 'מידע, תקשורת ושיתוף',
  lifesaving_behavior:       'התנהגות אפקטיבית להצלת חיים',
  functional_continuity:     'רציפות תפקודית',
  community_capital:         'הון ומשאבי קהילה',
  leadership:                'מנהיגות',
  belonging_solidarity:      'שייכות וסולידריות',
  wellbeing_atrisk:          'דאגה לרווחה',
};

const COMPONENT_NAMES_EN = {
  narrative:                 'Narrative',
  information_communication: 'Information & Communication',
  lifesaving_behavior:       'Lifesaving Behavior',
  functional_continuity:     'Functional Continuity',
  community_capital:         'Community Capital',
  leadership:                'Leadership',
  belonging_solidarity:      'Belonging & Solidarity',
  wellbeing_atrisk:          'Wellbeing (At-Risk)',
};

/**
 * Map column index to { component, kind, invert }.
 */
function buildColumnIndex(headers) {
  const mapping = new Array(headers.length).fill(null);
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    if (!h || i === 0) continue; // col 0 = municipality name
    for (const def of COLUMN_MAP) {
      if (h.includes(def.pattern)) {
        mapping[i] = { component: def.component, kind: def.kind, invert: !!def.invert, pattern: def.pattern };
        break;
      }
    }
  }
  return mapping;
}

/**
 * Extract date from the filter row at end of sheet (SlicerDate הוא DD/MM/YYYY).
 */
function extractDate(rows) {
  for (let i = rows.length - 1; i >= Math.max(0, rows.length - 5); i--) {
    const cell = String(rows[i]?.[0] ?? '');
    const m = cell.match(/SlicerDate\s+הוא\s+(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`; // YYYY-MM-DD
  }
  return null;
}

/**
 * Parse one Excel file → { date, district, municipalities: [...] }
 */
function parseOneFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  if (rows.length < 3) return null;

  const headers = rows[0];
  const colMap = buildColumnIndex(headers);
  const date = extractDate(rows);

  const municipalities = [];

  // Data rows start at index 2 (0=headers, 1=sub-header "רשות / value הראשון")
  for (let r = 2; r < rows.length; r++) {
    const row = rows[r];
    const name = String(row[0] ?? '').trim();
    // Skip filter/metadata rows
    if (!name || name.startsWith('מסננים')) break;

    const components = {};
    for (const cid of COMPONENTS_ORDER) {
      components[cid] = { scores: [], texts: [], avg: null };
    }

    for (let c = 1; c < row.length; c++) {
      const def = colMap[c];
      if (!def) continue;
      const val = row[c];
      if (def.kind === 'score') {
        const num = parseFloat(val);
        if (!isNaN(num)) {
          // Invert: 1 → 0, 0.75 → 0.25, etc.
          components[def.component].scores.push({ label: def.pattern, value: def.invert ? 1 - num : num });
        }
      } else if (def.kind === 'text') {
        const txt = String(val ?? '').trim();
        if (txt) components[def.component].texts.push(txt);
      }
    }

    // Compute averages
    for (const cid of COMPONENTS_ORDER) {
      const s = components[cid].scores;
      components[cid].avg = s.length > 0 ? +(s.reduce((a, b) => a + b.value, 0) / s.length).toFixed(3) : null;
    }

    municipalities.push({ name, components });
  }

  return { date, file: basename(filePath), municipalities };
}

/**
 * Scan the pbo_report_muni directory for all .xlsx files, parse them, return all days.
 */
export function getMunicipalityDashboard() {
  const dir = resolve(import.meta.dirname, '..');
  const files = readdirSync(dir).filter((f) => f.endsWith('.xlsx')).sort();

  const days = [];
  for (const f of files) {
    const parsed = parseOneFile(resolve(dir, f));
    if (parsed && parsed.municipalities.length > 0) {
      days.push(parsed);
    }
  }

  // Sort by date
  days.sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  // Aggregate: list of all unique municipality names
  const allMunis = [...new Set(days.flatMap((d) => d.municipalities.map((m) => m.name)))].sort();

  // Compute district-wide averages per component per day
  const districtTrend = days.map((day) => {
    const avgByComp = {};
    for (const cid of COMPONENTS_ORDER) {
      const vals = day.municipalities.map((m) => m.components[cid].avg).filter((v) => v != null);
      avgByComp[cid] = vals.length > 0 ? +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(3) : null;
    }
    return { date: day.date, file: day.file, municipalityCount: day.municipalities.length, avgByComponent: avgByComp };
  });

  return {
    componentsOrder: COMPONENTS_ORDER,
    componentNames: { en: COMPONENT_NAMES_EN, he: COMPONENT_NAMES_HE },
    municipalities: allMunis,
    days,
    districtTrend,
  };
}
