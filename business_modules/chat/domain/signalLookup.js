/**
 * Signal and report lookup utilities for chat tools.
 */
import { resolveStateStore } from '../../../cross-cut-modules/persistence/domain/resolveStateStore.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}
import { join } from 'node:path';
import { formatAnalysisDateTime } from '../../../utils/dateUtils.js';
import {
  deriveInstrumentState,
  operatorAssessmentSummary,
} from '../../resilience/index.js';
import {
  resolveMunicipalityName,
  signalMatchesMunicipality,
} from './municipalityResolve.js';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const SIGNALS_DIRS = [
  join(REPO_ROOT, 'business_modules', 'signals_extraction', 'data', 'signals'),
  join(REPO_ROOT, 'business_modules', 'visits', 'data', 'signals'),
  join(REPO_ROOT, 'business_modules', 'social_media', 'data'),
];
const OBSERVATIONS_DIR = join(REPO_ROOT, 'business_modules', 'signals_extraction', 'data');
const REPORTS_DIR = join(REPO_ROOT, 'daily_reports');
const REPORT_DATE_RE = /-data-(\d{4}-\d{2}-\d{2})-run-/;
const SIGNAL_FILE_RE = /signals-(.+?)-(\d{4}-\d{2}-\d{2})\.json/;

function readSignalDirNames(dir) {
  try {
    return getStore().readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return null;
  }
}

function isSignalBundleFile(name) {
  return name.startsWith('signals-') || name.startsWith('signals-social-');
}

function extractFileDate(name) {
  const m = SIGNAL_FILE_RE.exec(name);
  return m ? m[2] : null;
}

function matchesSignalFilters(name, { date, dateFrom, dateTo, sourceType }) {
  if (sourceType) {
    const prefix = sourceType === 'social' ? 'signals-social-' : `signals-${sourceType}-`;
    if (!name.startsWith(prefix)) return false;
  }
  const fileDate = extractFileDate(name);
  if (date && !name.includes(date)) return false;
  if (dateFrom && fileDate && fileDate < dateFrom) return false;
  if (dateTo && fileDate && fileDate > dateTo) return false;
  if ((dateFrom || dateTo) && !fileDate) return false;
  return !date || name.includes(date);
}

function listSignalJsonFiles({ date, dateFrom, dateTo, sourceType } = {}) {
  const seen = new Set();
  const files = [];
  const filters = { date, dateFrom, dateTo, sourceType };
  for (const dir of SIGNALS_DIRS) {
    const names = readSignalDirNames(dir);
    if (!names) continue;
    for (const f of names) {
      if (!isSignalBundleFile(f) || !matchesSignalFilters(f, filters)) continue;
      const key = `${dir}/${f}`;
      if (seen.has(key)) continue;
      seen.add(key);
      files.push({ dir, name: f });
    }
  }
  files.sort((a, b) => `${a.dir}/${a.name}`.localeCompare(`${b.dir}/${b.name}`));
  return files;
}

/**
 * Load signals from JSON files, optionally filtered by date and/or source type.
 * Scans signals_extraction/data/signals/, visits/data/signals/, and social_media/data/.
 * @param {{ date?: string, dateFrom?: string, dateTo?: string, sourceType?: string }} opts
 * @returns {Array} flat array of signal objects with file-level metadata merged in
 */
export function loadSignals({ date, dateFrom, dateTo, sourceType } = {}) {
  const fileEntries = listSignalJsonFiles({ date, dateFrom, dateTo, sourceType });
  const results = [];
  for (const { dir, name: f } of fileEntries) {
    try {
      const raw = JSON.parse(getStore().readFileSync(join(dir, f), 'utf-8'));
      const meta = {
        source_type: raw.source_type ?? (f.startsWith('signals-social-') ? 'social' : undefined),
        date: raw.date,
        extracted_at: raw.extracted_at ?? null,
        file: f,
        signal_dir: dir,
      };
      const sigs = raw.signals ?? [];
      for (let i = 0; i < sigs.length; i++) {
        const sig = sigs[i];
        const signal_id = `${f}#${i + 1}`;
        results.push({ ...meta, signal_id, ...sig });
      }
    } catch { /* skip corrupt files */ }
  }
  return results;
}

/**
 * Load open observations (unmapped) from signals_extraction bundles for analyst lookup.
 * @param {{ date?: string, profile?: string, limit?: number }} [opts]
 * @returns {Array<object>}
 */
export function loadObservations({ date, profile, limit = 50 } = {}) {
  let names;
  try {
    names = getStore().readdirSync(OBSERVATIONS_DIR).filter((f) =>
      f.startsWith('observations-') && f.endsWith('.json'),
    );
  } catch {
    return [];
  }

  const results = [];
  for (const f of names) {
    if (date && !f.includes(date)) continue;
    if (profile && !f.startsWith(`observations-${profile}-`)) continue;
    try {
      const raw = JSON.parse(getStore().readFileSync(join(OBSERVATIONS_DIR, f), 'utf-8'));
      for (const obs of raw.observations ?? []) {
        results.push({
          observation_id: obs.observation_id,
          profile: raw.profile,
          date: raw.date,
          source_type: raw.source_type,
          file: f,
          behavioral_description: obs.behavioral_description,
          evidence: obs.evidence,
          suggested_catalog_types: obs.suggested_catalog_types ?? [],
          polarity: obs.polarity,
          confidence: obs.confidence,
        });
        if (results.length >= limit) return results;
      }
    } catch { /* skip */ }
  }
  return results;
}

/**
 * Search signals by text query and/or structured filters.
 * @param {Array} signals - flat signal array from loadSignals()
 * @param {{ query?: string, component?: string, sourceType?: string, municipality?: string, limit?: number }} opts
 * @returns {Array} matching signals, capped at limit
 */
export function searchSignals(signals, { query, component, sourceType, municipality, limit = 10 } = {}) {
  let filtered = signals;

  if (sourceType) {
    filtered = filtered.filter((s) => s.source_type === sourceType);
  }

  if (component) {
    // Map component IDs to their signal_type prefixes
    const componentSignalMap = {
      narrative: ['coping_narrative', 'victimhood_narrative', 'helplessness_narrative', 'empowerment_narrative'],
      information_communication: ['information_seeking', 'information_sharing', 'information_confusion', 'rumor_spread', 'information_trust', 'information_distrust'],
      lifesaving_behavior: ['shelter_compliance', 'shelter_noncompliance', 'evacuation_compliance', 'evacuation_refusal', 'emergency_preparedness', 'preparedness_gap'],
      functional_continuity: ['routine_maintenance', 'routine_disruption', 'service_continuity', 'service_gap', 'economic_continuity', 'economic_disruption', 'education_continuity', 'education_disruption', 'coordination_success', 'coordination_failure'],
      community_capital: ['mutual_aid', 'volunteer_action', 'community_initiative', 'social_cohesion', 'social_fragmentation', 'community_organization'],
      leadership: ['leadership_visible_presence', 'leadership_absence', 'leadership_trust', 'leadership_distrust', 'leadership_action', 'leadership_inaction'],
      belonging_solidarity: ['solidarity_expression', 'solidarity_action', 'belonging_expression', 'alienation_expression', 'national_solidarity', 'inter_group_tension'],
      wellbeing_at_risk: ['fear_expression', 'calm_confidence', 'stress_indicator', 'trauma_indicator', 'mental_health_concern', 'welfare_need', 'welfare_response', 'welfare_gap', 'vulnerable_population_concern'],
    };
    const types = componentSignalMap[component];
    if (types) {
      filtered = filtered.filter((s) => types.includes(s.signal_type));
    }
  }

  if (municipality) {
    const resolved = resolveMunicipalityName(municipality);
    filtered = filtered.filter((s) => signalMatchesMunicipality(s, resolved ?? municipality));
  }

  if (query) {
    const q = query.toLowerCase();
    filtered = filtered.filter((s) =>
      (s.evidence ?? '').toLowerCase().includes(q) ||
      (s.signal_type ?? '').toLowerCase().includes(q) ||
      (s.article_source ?? '').toLowerCase().includes(q),
    );
  }

  return filtered.slice(0, limit);
}

function formatSignalLine(s, i) {
  const when = formatAnalysisDateTime(s.extracted_at ?? s.date) ?? s.date ?? 'unknown';
  let line = `[${i + 1}] id=${s.signal_id ?? 'unknown'} — ${s.signal_type} (${s.source_type}, ${when})`;
  if (s.article_source) line += ` — ${s.article_source}`;
  if (s.source_id) line += `\n    source_id=${s.source_id}`;
  line += `\n    ${s.evidence?.slice(0, 300)}`;
  if (s.article_url) line += `\n    ${s.article_url}`;
  return line;
}

/**
 * Format signals for tool output (concise, readable).
 * @param {Array} signals
 * @param {{ groupBy?: 'date' }} [opts]
 */
export function formatSignals(signals, opts = {}) {
  if (signals.length === 0) return 'No matching signals found.';
  if (opts.groupBy === 'date') {
    const byDate = new Map();
    for (const s of signals) {
      const d = s.date ?? 'unknown';
      if (!byDate.has(d)) byDate.set(d, []);
      byDate.get(d).push(s);
    }
    const sections = [];
    for (const d of [...byDate.keys()].sort((a, b) => a.localeCompare(b))) {
      const group = byDate.get(d);
      sections.push(
        `### ${d} (${group.length} signals)\n` +
        group.map((s, i) => formatSignalLine(s, i)).join('\n\n'),
      );
    }
    return sections.join('\n\n');
  }
  return signals.map((s, i) => formatSignalLine(s, i)).join('\n\n');
}

/**
 * Load a resilience report JSON for a given date.
 * Finds the latest report file matching the date.
 * @param {string} date - YYYY-MM-DD
 * @returns {object|null} parsed report or null
 */
export function loadReport(date) {
  let files;
  try {
    files = getStore().readdirSync(REPORTS_DIR)
      .filter((f) => f.includes(`-data-${date}-run-`) && f.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return null;
  }
  if (files.length === 0) return null;
  try {
    return JSON.parse(getStore().readFileSync(join(REPORTS_DIR, files.at(-1)), 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * List available report dates (for system context).
 * @returns {string[]} sorted array of YYYY-MM-DD strings
 */
export function listReportDates() {
  let files;
  try {
    files = getStore().readdirSync(REPORTS_DIR)
      .filter((f) => f.startsWith('resilience-report-') && f.endsWith('.json'))
      .sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
  const dates = new Set();
  for (const f of files) {
    const m = REPORT_DATE_RE.exec(f);
    if (m) dates.add(m[1]);
  }
  return [...dates].sort((a, b) => a.localeCompare(b));
}

/**
 * List available signal source types and dates.
 * @returns {{ sourceTypes: string[], signalDates: string[] }}
 */
export function listSignalMeta() {
  const entries = listSignalJsonFiles();
  const files = entries.map((e) => e.name);
  if (files.length === 0) {
    return { sourceTypes: [], signalDates: [] };
  }
  const types = new Set();
  const dates = new Set();
  for (const f of files) {
    const m = SIGNAL_FILE_RE.exec(f);
    if (m) {
      types.add(m[1]);
      dates.add(m[2]);
    }
  }
  return {
    sourceTypes: [...types].sort((a, b) => a.localeCompare(b)),
    signalDates: [...dates].sort((a, b) => a.localeCompare(b)),
  };
}

function formatDeltaArrow(delta) {
  if (delta > 0) return '+';
  if (delta < 0) return '';
  return '=';
}

/**
 * @param {string} dateA
 * @param {string} dateB
 * @param {object} reportA
 * @param {object} reportB
 * @param {boolean} includeScores
 * @returns {string[]}
 */
function formatOverallComparison(dateA, dateB, reportA, reportB, includeScores) {
  const labelA = formatAnalysisDateTime(reportA.generated_at) ?? dateA;
  const labelB = formatAnalysisDateTime(reportB.generated_at) ?? dateB;
  const header = [`Comparison: ${labelA} → ${labelB}\n`];
  if (includeScores) {
    header.push(
      `Overall: ${reportA.assessment.overall_resilience_score}/10 → ${reportB.assessment.overall_resilience_score}/10`,
    );
  } else {
    header.push(
      `Summary A: ${operatorAssessmentSummary(reportA.assessment)}`,
      `Summary B: ${operatorAssessmentSummary(reportB.assessment)}`,
    );
  }
  header.push(
    `Articles: ${reportA.assessment.total_articles_analyzed} → ${reportB.assessment.total_articles_analyzed}\n`,
  );
  return header;
}

/**
 * @param {string} id
 * @param {object|undefined} a
 * @param {object} b
 * @param {boolean} includeScores
 * @returns {string|null}
 */
function formatComponentDelta(id, a, b, includeScores) {
  if (a == null) {
    if (includeScores && b.score != null) {
      return `  ${id}: NEW ${b.score}/10 (${b.confidence})`;
    }
    const inst = b.instrument ?? deriveInstrumentState(b);
    return `  ${id}: NEW (${inst.confidence}, ${inst.evidence_sufficiency})`;
  }
  if (includeScores && a.score != null && b.score != null) {
    const delta = b.score - a.score;
    const arrow = formatDeltaArrow(delta);
    return `  ${id}: ${a.score} → ${b.score} (${arrow}${delta}) [${a.confidence} → ${b.confidence}]`;
  }
  const instA = a.instrument ?? deriveInstrumentState(a);
  const instB = b.instrument ?? deriveInstrumentState(b);
  return `  ${id}: [${instA.confidence}/${instA.evidence_sufficiency}] → [${instB.confidence}/${instB.evidence_sufficiency}]`;
}

/**
 * @param {Record<string, object>} aComps
 * @param {Record<string, object>} bComps
 * @returns {string[]}
 */
function formatNarrativeChanges(aComps, bComps) {
  const lines = ['\nKey narrative changes:'];
  for (const [id, b] of Object.entries(bComps)) {
    const a = aComps[id];
    if (a == null) continue;
    const aAbsent = new Set(a.manifestations_absent ?? []);
    const bEvidenced = b.manifestations_evidenced ?? [];
    const newlyEvidenced = bEvidenced.filter((m) => aAbsent.has(m));
    if (newlyEvidenced.length > 0) {
      lines.push(`  ${id}: newly evidenced — ${newlyEvidenced[0].slice(0, 150)}`);
    }
  }
  return lines;
}

/**
 * Compare two report dates — produce per-component deltas.
 * @param {string} dateA - older date (YYYY-MM-DD)
 * @param {string} dateB - newer date (YYYY-MM-DD)
 * @param {{ includeScores?: boolean }} [opts]
 * @returns {string} formatted comparison text
 */
export function compareReports(dateA, dateB, opts = {}) {
  const reportA = loadReport(dateA);
  const reportB = loadReport(dateB);

  if (reportA == null && reportB == null) return `No reports found for ${dateA} or ${dateB}.`;
  if (reportA == null) return `No report found for ${dateA}. Available dates: ${listReportDates().join(', ')}`;
  if (reportB == null) return `No report found for ${dateB}. Available dates: ${listReportDates().join(', ')}`;

  const aComps = Object.fromEntries(
    (reportA.assessment.components ?? []).map((c) => [c.component_id, c]),
  );
  const bComps = Object.fromEntries(
    (reportB.assessment.components ?? []).map((c) => [c.component_id, c]),
  );

  const includeScores = opts.includeScores === true;
  const componentLines = Object.entries(bComps).map(
    ([id, b]) => formatComponentDelta(id, aComps[id], b, includeScores),
  );

  return [
    ...formatOverallComparison(dateA, dateB, reportA, reportB, includeScores),
    'Per-component deltas:',
    ...componentLines,
    ...formatNarrativeChanges(aComps, bComps),
  ].join('\n');
}
