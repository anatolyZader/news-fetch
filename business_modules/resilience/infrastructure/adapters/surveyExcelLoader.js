/**
 * Parses a Google Forms Excel export + question-component mapping.
 *
 * Mapping file: JSON array of { matches, component }
 *   "matches" is a substring matched against the question text.
 *   "component" is one of the 8 resilience component IDs, or "context".
 *
 * Returns:
 *   {
 *     municipalities: [{
 *       name,
 *       byComponent: {
 *         narrative:               [{ question, answer }],
 *         information_communication: [],
 *         lifesaving_behavior:     [...],
 *         functional_continuity:   [...],
 *         community_capital:       [],
 *         leadership:              [],
 *         belonging_solidarity:    [],
 *         wellbeing_atrisk:        [],
 *         context:                 [...]   ← background, not assessed
 *       }
 *     }],
 *     unmapped: [string]   ← question texts with no mapping match
 *   }
 */

import { readFileSync } from 'fs';
import * as _XLSX from 'xlsx';
const XLSX = _XLSX.default ?? _XLSX;

const MUNICIPALITY_COLUMN = 'רשות';
const SKIP_PATTERN = /חותמת זמן|timestamp|תאריך ביצוע|שמות הקה|שם קה"א ומפקד/i;

const ALL_COMPONENTS = [
  'narrative', 'information_communication', 'lifesaving_behavior',
  'functional_continuity', 'community_capital', 'leadership',
  'belonging_solidarity', 'wellbeing_atrisk', 'context',
];

/**
 * @param {string} excelPath    Path to Google Forms .xlsx export
 * @param {string} mappingPath  Path to question-component mapping JSON
 */
export function parseSurveyExcel(excelPath, mappingPath) {
  // Load mapping
  const mapping = JSON.parse(readFileSync(mappingPath, 'utf-8'));

  // Load Excel
  const workbook = XLSX.readFile(excelPath);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

  if (rows.length === 0) throw new Error('Survey Excel contains no data rows');

  const allColumns = Object.keys(rows[0]);

  // Find municipality column
  const municipalityCol = allColumns.find((c) => c.includes(MUNICIPALITY_COLUMN));
  if (!municipalityCol) {
    throw new Error(`Municipality column containing "${MUNICIPALITY_COLUMN}" not found`);
  }

  // Question columns only
  const questionColumns = allColumns.filter(
    (c) => !SKIP_PATTERN.test(c) && c !== municipalityCol,
  );

  // Map each question column to its component
  const columnToComponent = new Map();
  const unmapped = [];

  for (const col of questionColumns) {
    const rule = mapping.find((r) => col.includes(r.matches));
    if (rule) {
      columnToComponent.set(col, rule.component);
    } else {
      columnToComponent.set(col, 'context'); // default unmapped → context
      unmapped.push(col);
    }
  }

  // Group rows by municipality (last submission wins on duplicate)
  const munMap = new Map();

  for (const row of rows) {
    const name = String(row[municipalityCol] ?? '').trim();
    if (!name) continue;

    const byComponent = Object.fromEntries(ALL_COMPONENTS.map((c) => [c, []]));

    for (const col of questionColumns) {
      const answer = String(row[col] ?? '').trim();
      if (!answer || answer === '-') continue;
      const component = columnToComponent.get(col) ?? 'context';
      byComponent[component].push({ question: col.trim(), answer: answer.slice(0, 600) });
    }

    munMap.set(name, byComponent);
  }

  const municipalities = Array.from(munMap.entries()).map(([name, byComponent]) => ({
    name,
    byComponent,
  }));

  if (municipalities.length === 0) {
    throw new Error('No municipalities found in the Excel file');
  }

  return { municipalities, unmapped };
}
