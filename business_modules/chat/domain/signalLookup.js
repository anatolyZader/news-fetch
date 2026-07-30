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
  resilienceReportsDir,
  listReportJsonFilenamesForDate,
  parseReportFilename,
  SIGNAL_TO_COMPONENTS,
  canonicalizeSignalType,
} from '../../resilience_scorer/index.js';
import {
  resolveMunicipalityName,
  signalMatchesMunicipality,
} from './municipalityResolve.js';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const SIGNALS_DIRS = [
  join(REPO_ROOT, 'business_modules', 'resilience_scorer', 'data', 'signals'),
  join(REPO_ROOT, 'business_modules', 'visits', 'data', 'signals'),
  join(REPO_ROOT, 'business_modules', 'social_media', 'data'),
];
const OBSERVATIONS_DIR = join(REPO_ROOT, 'business_modules', 'open_observation_extraction', 'data');
const REPORTS_DIR = resilienceReportsDir(REPO_ROOT);
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
 * Scans resilience_scorer/data/signals/, visits/data/signals/, and social_media/data/.
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
 * Load open observations (unmapped) from open_observation_extraction bundles for analyst lookup.
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
 * Signal types with any routing edge (primary or inferred) to a component,
 * derived from the canonical catalog routing so it never drifts across epochs.
 */
let componentTypesCache = null;
function signalTypesForComponent(component) {
  if (!componentTypesCache) {
    componentTypesCache = new Map();
    for (const [type, edges] of Object.entries(SIGNAL_TO_COMPONENTS)) {
      for (const componentId of Object.keys(edges ?? {})) {
        if (!componentTypesCache.has(componentId)) componentTypesCache.set(componentId, new Set());
        componentTypesCache.get(componentId).add(type);
      }
    }
  }
  return componentTypesCache.get(component) ?? null;
}

function signalRecencyKey(s) {
  return String(s.extracted_at ?? s.date ?? '');
}

/**
 * Search signals by text query and/or structured filters.
 * Results are ordered newest-first before the limit is applied.
 * @param {Array} signals - flat signal array from loadSignals()
 * @param {{ query?: string, component?: string, sourceType?: string, municipality?: string, limit?: number }} opts
 * @returns {Array} matching signals, capped at limit
 */
export function searchSignals(signals, { query, component, signalType, sourceType, municipality, limit = 10 } = {}) {
  let filtered = signals;

  if (sourceType) {
    filtered = filtered.filter((s) => s.source_type === sourceType);
  }

  if (signalType) {
    filtered = filtered.filter((s) => s.signal_type === signalType);
  }

  if (component) {
    const types = signalTypesForComponent(component);
    if (types) {
      filtered = filtered.filter((s) => types.has(canonicalizeSignalType(s.signal_type ?? '')));
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

  return [...filtered]
    .sort((a, b) => signalRecencyKey(b).localeCompare(signalRecencyKey(a)))
    .slice(0, limit);
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
 * @param {string} [scopeId] report scope (default national)
 * @returns {object|null} parsed report or null
 */
export function loadReport(date, scopeId = 'national') {
  let files;
  try {
    files = listReportJsonFilenamesForDate(REPORTS_DIR, date, scopeId)
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
      .filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const dates = new Set();
  for (const f of files) {
    const parsed = parseReportFilename(f);
    if (parsed) dates.add(parsed.reportDate);
  }
  return [...dates].sort((a, b) => a.localeCompare(b));
}

/**
 * Report dates grouped by report scope id.
 * @returns {Record<string, string[]>} scopeId → sorted YYYY-MM-DD dates
 */
export function listReportDatesByScope() {
  let files;
  try {
    files = getStore().readdirSync(REPORTS_DIR).filter((f) => f.endsWith('.json'));
  } catch {
    return {};
  }
  const byScope = new Map();
  for (const f of files) {
    const parsed = parseReportFilename(f);
    if (!parsed) continue;
    if (!byScope.has(parsed.scopeId)) byScope.set(parsed.scopeId, new Set());
    byScope.get(parsed.scopeId).add(parsed.reportDate);
  }
  const out = {};
  for (const [scope, dates] of byScope) {
    out[scope] = [...dates].sort((a, b) => a.localeCompare(b));
  }
  return out;
}

/**
 * Signal bundle dates grouped by source type (from bundle filenames).
 * @returns {Record<string, string[]>} sourceType → sorted YYYY-MM-DD dates
 */
export function listSignalDatesBySourceType() {
  const byType = new Map();
  for (const { name } of listSignalJsonFiles()) {
    const m = SIGNAL_FILE_RE.exec(name);
    if (!m) continue;
    if (!byType.has(m[1])) byType.set(m[1], new Set());
    byType.get(m[1]).add(m[2]);
  }
  const out = {};
  for (const [type, dates] of byType) {
    out[type] = [...dates].sort((a, b) => a.localeCompare(b));
  }
  return out;
}

const SIGNAL_ID_RE = /^(.+\.json)#(\d+)$/;

/**
 * Load one full signal by its id ("<file>#<idx1>" as emitted by loadSignals).
 * @param {string} signalId
 * @returns {{ signal?: object, error?: string }}
 */
export function getSignalById(signalId) {
  const m = SIGNAL_ID_RE.exec(String(signalId ?? '').trim());
  if (!m) {
    return { error: 'Invalid signal_id format — expected <file>#<index> from lookup_signals.' };
  }
  const [, file, idxStr] = m;
  const idx1 = Number(idxStr);
  for (const dir of SIGNALS_DIRS) {
    let raw;
    try {
      raw = JSON.parse(getStore().readFileSync(join(dir, file), 'utf-8'));
    } catch {
      continue;
    }
    const sigs = raw.signals ?? [];
    if (idx1 < 1 || idx1 > sigs.length) {
      return { error: `File ${file} has only ${sigs.length} signals (asked for #${idx1}).` };
    }
    return {
      signal: {
        source_type: raw.source_type ?? (file.startsWith('signals-social-') ? 'social' : undefined),
        date: raw.date,
        extracted_at: raw.extracted_at ?? null,
        file,
        signal_dir: dir,
        signal_id: `${file}#${idx1}`,
        ...sigs[idx1 - 1],
      },
    };
  }
  return { error: `No signal bundle named ${file} on disk.` };
}

const FULL_SIGNAL_SKIP_KEYS = new Set([
  'signal_id', 'signal_type', 'source_type', 'evidence', 'date', 'extracted_at',
  'article_source', 'article_url', 'source_id', 'signal_dir',
]);

/**
 * Full untruncated formatting of one signal (all fields; source_id= line kept
 * on its own line for the citation contract).
 * @param {object} s merged signal from getSignalById / loadSignals
 */
export function formatFullSignal(s) {
  const when = formatAnalysisDateTime(s.extracted_at ?? s.date) ?? s.date ?? 'unknown';
  const lines = [`id=${s.signal_id ?? 'unknown'} — ${s.signal_type} (${s.source_type}, ${when})`];
  if (s.article_source) lines.push(`article_source: ${s.article_source}`);
  if (s.source_id) lines.push(`source_id=${s.source_id}`);
  if (s.article_url) lines.push(`url: ${s.article_url}`);
  lines.push('', `evidence: ${s.evidence ?? '(none)'}`, '');
  for (const [key, value] of Object.entries(s)) {
    if (FULL_SIGNAL_SKIP_KEYS.has(key) || value == null || value === '') continue;
    const rendered = typeof value === 'object' ? JSON.stringify(value) : String(value);
    lines.push(`${key}: ${rendered}`);
  }
  return lines.join('\n');
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

/**
 * Dates for which PBO signal bundles exist on disk (sorted ascending).
 * @returns {string[]}
 */
export function listPboDates() {
  const entries = listSignalJsonFiles({ sourceType: 'pbo' });
  const dates = new Set();
  for (const { name } of entries) {
    const m = SIGNAL_FILE_RE.exec(name);
    if (m) dates.add(m[2]);
  }
  return [...dates].sort((a, b) => a.localeCompare(b));
}

const SIGNAL_STATS_GROUPS = new Set(['signal_type', 'municipality', 'date', 'source_type']);

function signalStatsKey(signal, groupBy) {
  if (groupBy === 'municipality') {
    return String(
      signal.municipality ?? signal.locality ?? signal.geo?.matchedName ?? 'unknown',
    );
  }
  return String(signal[groupBy] ?? 'unknown');
}

/**
 * Aggregate signal counts over loadSignals + searchSignals filters.
 * Deterministic (no LLM) — lets chat answer "how many X" in one tool round.
 * @param {{ date_from?: string, date_to?: string, component?: string, source_type?: string,
 *   municipality?: string, group_by?: 'signal_type'|'municipality'|'date'|'source_type' }} [input]
 * @returns {string} counts table text
 */
export function signalStats(input = {}) {
  const groupBy = SIGNAL_STATS_GROUPS.has(input.group_by) ? input.group_by : 'signal_type';
  const signals = loadSignals({
    dateFrom: input.date_from,
    dateTo: input.date_to,
    sourceType: input.source_type,
  });
  const matches = searchSignals(signals, {
    component: input.component,
    signalType: input.signal_type,
    sourceType: input.source_type,
    municipality: input.municipality,
    limit: Number.MAX_SAFE_INTEGER,
  });
  const counts = new Map();
  for (const s of matches) {
    const key = signalStatsKey(s, groupBy);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const rows = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 40);
  if (rows.length === 0) return 'No signals match the given filters.';
  return (
    `Signal counts by ${groupBy} (total ${matches.length}):\n` +
    rows.map(([k, n]) => `- ${k}: ${n}`).join('\n')
  );
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
  const scope = opts.scope ?? 'national';
  const reportA = loadReport(dateA, scope);
  const reportB = loadReport(dateB, scope);

  if (reportA == null && reportB == null) return `No reports found for ${dateA} or ${dateB} (scope=${scope}).`;
  if (reportA == null) return `No report found for ${dateA} (scope=${scope}). Available dates: ${listReportDates().join(', ')}`;
  if (reportB == null) return `No report found for ${dateB} (scope=${scope}). Available dates: ${listReportDates().join(', ')}`;

  const aComps = Object.fromEntries(
    (reportA.assessment.components ?? []).map((c) => [c.component_id, c]),
  );
  const bComps = Object.fromEntries(
    (reportB.assessment.components ?? []).map((c) => [c.component_id, c]),
  );

  const includeScores = opts.includeScores === true;
  const component = opts.component ?? null;
  const bEntries = component
    ? Object.entries(bComps).filter(([id]) => id === component)
    : Object.entries(bComps);
  if (component && bEntries.length === 0) {
    return `Component ${component} not present in the ${dateB} report (scope=${scope}).`;
  }
  const componentLines = bEntries.map(
    ([id, b]) => formatComponentDelta(id, aComps[id], b, includeScores),
  );
  const narrowedA = component ? { [component]: aComps[component] } : aComps;
  const narrowedB = component ? Object.fromEntries(bEntries) : bComps;

  return [
    ...formatOverallComparison(dateA, dateB, reportA, reportB, includeScores),
    component ? `Component delta (${component} only):` : 'Per-component deltas:',
    ...componentLines,
    ...formatNarrativeChanges(narrowedA, narrowedB),
  ].join('\n');
}
