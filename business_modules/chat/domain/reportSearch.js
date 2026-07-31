/**
 * Free-text search across past resilience report narratives on disk.
 * Callers must pass a redact hook for non-analyst views — it runs BEFORE any
 * text is searched so analyst-only fields never leak into snippets.
 */
import { join } from 'node:path';
import { resolveStateStore } from '../../../cross-cut-modules/persistence/domain/resolveStateStore.js';
import {
  resilienceReportsDir,
  parseReportFilename,
  normalizeReportScope,
} from '../../resilience_scorer/index.js';
import { listReportDates } from './signalLookup.js';

function getStore(deps = {}) {
  return resolveStateStore(deps);
}

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
const DEFAULT_REPORTS_DIR = resilienceReportsDir(REPO_ROOT);

function resolveReportsDir(deps = {}) {
  return deps.reportsDir ?? DEFAULT_REPORTS_DIR;
}

const SNIPPET_CHARS = 200;
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

function snippetAround(text, matchIdx, queryLength) {
  const half = Math.floor((SNIPPET_CHARS - queryLength) / 2);
  const start = Math.max(0, matchIdx - half);
  const end = Math.min(text.length, matchIdx + queryLength + half);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  return `${prefix}${text.slice(start, end).replaceAll(/\s+/g, ' ').trim()}${suffix}`;
}

function findHitInText(text, q) {
  const s = String(text ?? '');
  if (!s) return null;
  const idx = s.toLowerCase().indexOf(q);
  if (idx === -1) return null;
  return snippetAround(s, idx, q.length);
}

function findHitInList(items, q) {
  for (const item of items ?? []) {
    const hit = findHitInText(item, q);
    if (hit) return hit;
  }
  return null;
}

const COMPONENT_TEXT_FIELDS = [
  ['narrative', (c, q) => findHitInText(c.narrative, q)],
  ['narrative_operator', (c, q) => findHitInText(c.narrative_operator, q)],
  ['interpretive_summary', (c, q) => findHitInText(c.interpretive_summary, q)],
  ['evidence', (c, q) => findHitInList(c.evidence, q)],
  ['evidence_operator', (c, q) => findHitInList(c.evidence_operator, q)],
  ['manifestations_evidenced', (c, q) => findHitInList(c.manifestations_evidenced, q)],
  ['manifestations_absent', (c, q) => findHitInList(c.manifestations_absent, q)],
  ['narrative_claims', (c, q) => findHitInList((c.narrative_claims ?? []).map((cl) => cl?.text), q)],
];

function collectSynthesisHits(a, q) {
  const hits = [];
  for (const field of ['cross_component_synthesis', 'cross_component_synthesis_operator']) {
    const snippet = findHitInText(a[field], q);
    if (snippet) hits.push({ component_id: 'synthesis', field, snippet });
  }
  return hits;
}

function collectComponentHits(c, q) {
  const hits = [];
  for (const [field, finder] of COMPONENT_TEXT_FIELDS) {
    const snippet = finder(c, q);
    if (snippet) hits.push({ component_id: c.component_id, field, snippet });
  }
  return hits;
}

/**
 * Pure per-report search over narrative text fields (one hit per component/field).
 * @param {object} report parsed (already redacted where applicable) report JSON
 * @param {{ query: string, component?: string }} opts query must be lowercase
 * @returns {Array<{ component_id: string, field: string, snippet: string }>}
 */
export function collectReportHits(report, { query, component }) {
  const q = String(query ?? '').toLowerCase();
  const a = report?.assessment;
  if (!q || !a) return [];
  const hits = component ? [] : collectSynthesisHits(a, q);
  for (const c of a.components ?? []) {
    if (component && c.component_id !== component) continue;
    hits.push(...collectComponentHits(c, q));
  }
  return hits;
}

function listSearchableReportFiles(scope, dateFrom, dateTo, deps = {}) {
  const reportsDir = resolveReportsDir(deps);
  let files;
  try {
    files = getStore(deps).readdirSync(reportsDir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  // Latest file per (date, scope) — ascending filename sort, last one wins
  // (same tie-break as loadReport).
  const latest = new Map();
  for (const f of files.toSorted((a, b) => a.localeCompare(b))) {
    const parsed = parseReportFilename(f);
    if (!parsed) continue;
    if (scope && parsed.scopeId !== scope) continue;
    if (dateFrom && parsed.reportDate < dateFrom) continue;
    if (dateTo && parsed.reportDate > dateTo) continue;
    latest.set(`${parsed.reportDate}|${parsed.scopeId}`, {
      file: f,
      date: parsed.reportDate,
      scope: parsed.scopeId,
    });
  }
  // Newest dates first so hits favor recent reports.
  return [...latest.values()].sort((a, b) => b.date.localeCompare(a.date));
}

/**
 * Search past reports on disk for free text.
 * @param {{ query?: string, scope?: string, date_from?: string, date_to?: string,
 *   component?: string, limit?: number }} input
 * @param {{ redact?: (report: object) => object, reportsDir?: string,
 *   stateStore?: object }} [deps] redact runs before searching; reportsDir/stateStore
 *   are injectable for tests (daily_reports/ is gitignored and absent in CI)
 * @returns {string}
 */
export function searchReports(input = {}, deps = {}) {
  const query = String(input.query ?? '').trim();
  if (!query) return 'query is required.';
  const scope = String(input.scope ?? '').trim()
    ? normalizeReportScope(String(input.scope).trim())
    : null;
  const component = String(input.component ?? '').trim() || null;
  const limit = Math.min(Math.max(Number(input.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), MAX_LIMIT);

  const entries = listSearchableReportFiles(scope, input.date_from, input.date_to, deps);
  const { hits, scanned } = scanReportsForHits(entries, {
    q: query.toLowerCase(), component, limit, redact: deps.redact, deps,
  });

  if (hits.length === 0) {
    const filterNote = [scope ? `scope=${scope}` : '', component ? `component=${component}` : '']
      .filter(Boolean).join(', ');
    const filterPart = filterNote ? `; ${filterNote}` : '';
    return (
      `No report text matches "${query}" (scanned ${scanned} reports${filterPart}). ` +
      `Report dates: ${listReportDates().slice(-15).join(', ')}`
    );
  }
  return `Report search "${query}" — ${hits.length} hit(s), newest first:\n${hits.join('\n')}`;
}

function scanReportsForHits(entries, { q, component, limit, redact, deps = {} }) {
  const reportsDir = resolveReportsDir(deps);
  const store = getStore(deps);
  const hits = [];
  let scanned = 0;
  for (const entry of entries) {
    if (hits.length >= limit) break;
    let report;
    try {
      report = JSON.parse(store.readFileSync(join(reportsDir, entry.file), 'utf-8'));
    } catch {
      continue;
    }
    scanned += 1;
    if (redact) report = redact(report);
    for (const hit of collectReportHits(report, { query: q, component })) {
      if (hits.length >= limit) break;
      hits.push(`- ${entry.date} [${entry.scope}] ${hit.component_id}/${hit.field}: "${hit.snippet}"`);
    }
  }
  return { hits, scanned };
}
