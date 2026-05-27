/**
 * Service for Naftali weekly questionnaire data (Pools → Naftali subtab).
 *
 * Primary source: Google Sheets (live, updated when someone fills the form).
 * Fallback: local Excel files in business_modules/pool/data/naftali/.
 *
 * Both sources produce the same response shape, which is then aggregated
 * into a dashboard with weekly trends, severity distributions, and
 * per-municipality breakdowns.
 */

import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import XLSX from 'xlsx';
import { fetchNaftaliResponses } from '../infrastructure/adapters/naftaliGoogleSheetsAdapter.js';

const SEVERITY_KEYS = ['financialRequests', 'schoolMentalHealth', 'communityMentalHealth', 'parentalStress', 'coupleConflicts', 'parentChildConflicts'];
const VULN_KEYS = ['physicalDisability', 'mentalDisability', 'specialEducation', 'domesticViolence', 'severeFinancial', 'singleParent'];

// ─── Excel fallback parsing ─────────────────────────────────────────────────

const COL = {
  timestamp: 0, respondentName: 1, municipality: 2, welfareContact: 3,
  physicalDisability: 4, mentalDisability: 5, specialEducation: 6,
  domesticViolence: 7, severeFinancial: 8, singleParent: 9,
  evacuatedFamilies: 10, arrivedFamilies: 11, financialRequests: 12,
  schoolMentalHealth: 13, communityMentalHealth: 14, parentalStress: 15,
  coupleConflicts: 16, parentChildConflicts: 17, vulnerableGroups: 18,
  staffShortage: 19, responseTimeImpact: 20, volunteerInitiatives: 21,
  volunteerNeeds: 22, volunteerCoordination: 23, mainChallenge: 24,
  urgentNeeds: 25, additionalComments: 26,
};

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

function excelSerialToDate(serial) {
  if (typeof serial === 'string') {
    const d = new Date(serial);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof serial !== 'number') return null;
  const d = new Date((serial - 25569) * 86400000);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function parseExcelFile(filePath) {
  const wb = XLSX.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (rows.length < 2) return [];

  const responses = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const name = String(row[COL.municipality] ?? '').trim();
    if (!name) continue;
    responses.push({
      date: excelSerialToDate(row[COL.timestamp]),
      municipality: name,
      respondent: String(row[COL.respondentName] ?? '').trim(),
      vulnerable: {
        physicalDisability: parseInt(row[COL.physicalDisability], 10) || 0,
        mentalDisability:   parseInt(row[COL.mentalDisability],   10) || 0,
        specialEducation:   parseInt(row[COL.specialEducation],   10) || 0,
        domesticViolence:   parseInt(row[COL.domesticViolence],   10) || 0,
        severeFinancial:    parseInt(row[COL.severeFinancial],    10) || 0,
        singleParent:       parseInt(row[COL.singleParent],       10) || 0,
      },
      evacuated: String(row[COL.evacuatedFamilies] ?? '').trim(),
      arrived:   String(row[COL.arrivedFamilies]   ?? '').trim(),
      severity: {
        financialRequests:     normalizeSeverity(String(row[COL.financialRequests] ?? '')),
        schoolMentalHealth:    normalizeSeverity(String(row[COL.schoolMentalHealth] ?? '')),
        communityMentalHealth: normalizeSeverity(String(row[COL.communityMentalHealth] ?? '')),
        parentalStress:        normalizeSeverity(String(row[COL.parentalStress] ?? '')),
        coupleConflicts:       normalizeSeverity(String(row[COL.coupleConflicts] ?? '')),
        parentChildConflicts:  normalizeSeverity(String(row[COL.parentChildConflicts] ?? '')),
      },
      freeText: {
        vulnerableGroups:      String(row[COL.vulnerableGroups]      ?? '').trim(),
        staffShortage:         String(row[COL.staffShortage]         ?? '').trim(),
        responseTimeImpact:    String(row[COL.responseTimeImpact]    ?? '').trim(),
        volunteerInitiatives:  String(row[COL.volunteerInitiatives]  ?? '').trim(),
        volunteerNeeds:        String(row[COL.volunteerNeeds]        ?? '').trim(),
        volunteerCoordination: String(row[COL.volunteerCoordination] ?? '').trim(),
        mainChallenge:         String(row[COL.mainChallenge]         ?? '').trim(),
        urgentNeeds:           String(row[COL.urgentNeeds]           ?? '').trim(),
        additionalComments:    String(row[COL.additionalComments]    ?? '').trim(),
      },
    });
  }
  return responses;
}

function loadExcelFallback() {
  const dir = resolve(import.meta.dirname, '../data/naftali');
  const files = readdirSync(dir).filter(f => f.endsWith('.xlsx')).sort();
  const allResponses = [];
  for (const f of files) {
    allResponses.push(...parseExcelFile(resolve(dir, f)));
  }
  return allResponses;
}

// ─── Shared dashboard builder ───────────────────────────────────────────────

function isoWeekNumber(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const yearStart = new Date(d.getFullYear(), 0, 4);
  return Math.round(((d - yearStart) / 86400000 + 1) / 7);
}

function buildDashboard(responses) {
  if (!responses.length) {
    return { municipalities: [], weeks: [], trends: [], recentComments: [], byMunicipality: {}, summary: null };
  }

  const sorted = [...responses].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));

  // Group by ISO week
  const weekMap = {};
  for (const r of sorted) {
    if (!r.date) continue;
    const wn = isoWeekNumber(r.date);
    if (!weekMap[wn]) weekMap[wn] = { week: wn, responses: [], dates: [] };
    weekMap[wn].responses.push(r);
    weekMap[wn].dates.push(r.date);
  }

  const weeks = Object.values(weekMap)
    .sort((a, b) => a.week - b.week)
    .map(w => {
      const dates = [...new Set(w.dates)].sort();
      return {
        week: w.week,
        file: 'Google Sheets',
        dateFrom: dates[0],
        dateTo: dates[dates.length - 1],
        responses: w.responses,
      };
    });

  const allMunicipalities = [...new Set(sorted.map(r => r.municipality))].sort();

  const trends = weeks.map(week => {
    const rs = week.responses;
    const severityDist = {};
    for (const key of SEVERITY_KEYS) {
      severityDist[key] = { high: 0, medium: 0, low: 0, none: 0, unknown: 0, qualitative: 0 };
      for (const r of rs) {
        const val = r.severity[key];
        if (val in severityDist[key]) severityDist[key][val]++;
      }
    }
    const vulnTotals = {};
    for (const key of VULN_KEYS) {
      vulnTotals[key] = rs.reduce((s, r) => s + r.vulnerable[key], 0);
    }
    return {
      week: week.week,
      file: week.file,
      dateFrom: week.dateFrom,
      dateTo: week.dateTo,
      municipalityCount: rs.length,
      severityDist,
      vulnTotals,
    };
  });

  const lastWeek = weeks[weeks.length - 1];
  const recentComments = lastWeek
    ? lastWeek.responses
        .filter(r => r.freeText.mainChallenge || r.freeText.urgentNeeds || r.freeText.additionalComments)
        .map(r => ({
          municipality: r.municipality,
          date: r.date,
          mainChallenge: r.freeText.mainChallenge,
          urgentNeeds: r.freeText.urgentNeeds,
          additionalComments: r.freeText.additionalComments,
        }))
    : [];

  const byMunicipality = {};
  for (const name of allMunicipalities) {
    const weekData = weeks
      .filter(w => w.responses.some(r => r.municipality === name))
      .map(w => {
        const r = w.responses.find(r => r.municipality === name);
        return {
          week: w.week,
          dateFrom: w.dateFrom,
          dateTo: w.dateTo,
          severity: r.severity,
          vulnerable: r.vulnerable,
          freeText: r.freeText,
        };
      });
    byMunicipality[name] = { name, weeks: weekData };
  }

  return {
    municipalities: allMunicipalities,
    weeks,
    trends,
    recentComments,
    byMunicipality,
    summary: {
      totalWeeks: weeks.length,
      totalResponses: sorted.length,
      municipalities: allMunicipalities,
      dateRange: weeks.length > 0
        ? { from: weeks[0].dateFrom, to: weeks[weeks.length - 1].dateTo }
        : null,
      latestWeek: lastWeek?.week ?? null,
    },
  };
}

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get dashboard from Google Sheets (live). Falls back to local Excel files.
 */
export async function getNaftaliDashboard({ forceRefresh = false } = {}) {
  try {
    const responses = await fetchNaftaliResponses({ forceRefresh });
    if (responses.length > 0) return buildDashboard(responses);
  } catch (err) {
    console.error(`[naftali] Google Sheets fetch failed, falling back to Excel: ${err.message}`);
  }
  return buildDashboard(loadExcelFallback());
}

/**
 * Sync version for signal extraction (reads local Excel only).
 */
export function getNaftaliDashboardSync() {
  return buildDashboard(loadExcelFallback());
}
