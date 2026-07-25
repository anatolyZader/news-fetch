/**
 * Server-side component timeline across report dates (single tool round).
 */
import {
  loadReport,
  loadSignals,
  listReportDates,
  listSignalMeta,
  searchSignals,
} from './signalLookup.js';
import {
  findMunicipalityInDay,
  resolveMunicipalityName,
} from './municipalityResolve.js';
import { deriveInstrumentState } from '../../resilience_scorer/index.js';
import { formatAnalysisDateTime } from '../../../utils/dateUtils.js';

const NARRATIVE_MAX = 300;
const PBO_TEXT_MAX = 200;
const REVIEW_TEXT_MAX = 150;
const MAX_EXPLICIT_DATE_RANGE_DAYS = 366;

function enumerateDateRange(from, to) {
  const dates = [];
  let cur = new Date(`${from}T12:00:00.000Z`);
  const end = new Date(`${to}T12:00:00.000Z`);
  while (cur <= end && dates.length < MAX_EXPLICIT_DATE_RANGE_DAYS) {
    dates.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return dates;
}

function clip(text, max) {
  const s = String(text ?? '').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max)}…`;
}

function formatInstrumentLine(comp, includeScores) {
  if (!comp) return '—';
  if (includeScores && comp.score != null) {
    return `${comp.score}/10 (${comp.confidence})`;
  }
  const inst = comp.instrument ?? deriveInstrumentState(comp);
  return `${inst.confidence}/${inst.evidence_sufficiency}`;
}

/**
 * @param {string} [dateFrom]
 * @param {string} [dateTo]
 * @param {boolean} [includeSignalOnlyDates]
 * @returns {string[]}
 */
export function resolveDateWindow(dateFrom, dateTo, includeSignalOnlyDates = false) {
  const reportDates = listReportDates();
  const { signalDates } = listSignalMeta();
  let dates = [...new Set([...reportDates, ...(includeSignalOnlyDates ? signalDates : [])])];
  dates.sort((a, b) => a.localeCompare(b));
  if (dateFrom) dates = dates.filter((d) => d >= dateFrom);
  if (dateTo) dates = dates.filter((d) => d <= dateTo);
  if (dates.length === 0 && dateFrom && dateTo && dateFrom <= dateTo) {
    dates = enumerateDateRange(dateFrom, dateTo);
  }
  return dates;
}

const DASHBOARD_CACHE_TTL_MS = 5 * 60 * 1000;
/** @type {{ at: number, data: object|null }} */
let dashboardCache = { at: 0, data: null };

export function getCachedDashboard(getMunicipalityDashboard) {
  if (!getMunicipalityDashboard) return null;
  const now = Date.now();
  if (dashboardCache.data && now - dashboardCache.at < DASHBOARD_CACHE_TTL_MS) {
    return dashboardCache.data;
  }
  const data = getMunicipalityDashboard();
  dashboardCache = { at: now, data };
  return data;
}

/** @param {Array} signals @param {string} date */
function signalsForDate(signals, date) {
  return signals.filter((s) => s.date === date);
}

function extractPboReviewSnippet(detail, componentId) {
  if (!detail) return null;
  const supplemental = detail.supplementalTexts ?? {};
  if (supplemental[componentId]) {
    return clip(supplemental[componentId], REVIEW_TEXT_MAX);
  }
  const gap = (detail.gaps ?? []).find((g) => g.componentId === componentId);
  if (gap?.reason) return clip(`gap: ${gap.reason}`, REVIEW_TEXT_MAX);
  return null;
}

/**
 * @param {string} date
 * @param {object|null} report
 * @param {Array} daySignals
 * @returns {{ analyzed_at: string|null, analyzed_at_label: string }}
 */
function resolveAnalyzedAt(date, report, daySignals) {
  const fromReport = report?.generated_at ?? null;
  if (fromReport) {
    return {
      analyzed_at: fromReport,
      analyzed_at_label: formatAnalysisDateTime(fromReport) ?? date,
    };
  }
  const extracted = daySignals
    .map((s) => s.extracted_at)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .at(-1) ?? null;
  if (extracted) {
    return {
      analyzed_at: extracted,
      analyzed_at_label: formatAnalysisDateTime(extracted) ?? date,
    };
  }
  return { analyzed_at: null, analyzed_at_label: date };
}

function enrichRowFromReport(row, report, componentId, includeScores, reportDates, gaps) {
  if (!report?.assessment) {
    if (reportDates.has(row.date)) {
      gaps.push(`report file missing for ${row.date}`);
    }
    return;
  }

  const comp = (report.assessment.components ?? []).find((c) => c.component_id === componentId);
  if (comp) {
    row.instrument = formatInstrumentLine(comp, includeScores);
    row.narrative_excerpt = clip(comp.narrative_operator ?? comp.narrative ?? '', NARRATIVE_MAX);
    return;
  }
  gaps.push(`no component ${componentId} in report ${row.date}`);
}

function enrichRowFromPbo(row, dashboard, municipality, componentId, reportDates, gaps) {
  if (!municipality || !dashboard) return;

  const day = dashboard.days?.find((d) => d.date === row.date);
  if (!day) {
    if (reportDates.has(row.date)) {
      gaps.push(`no PBO dashboard day for ${row.date}`);
    }
    return;
  }

  const muni = findMunicipalityInDay(day, municipality);
  if (!muni) {
    gaps.push(`no PBO row for ${municipality} on ${row.date}`);
    return;
  }

  const compData = muni.components?.[componentId];
  if (compData?.avg != null) {
    row.pbo_avg = String(compData.avg);
  }
  const texts = compData?.texts ?? [];
  if (texts.length > 0) {
    row.pbo_text = clip(texts[0], PBO_TEXT_MAX);
  }
}

function enrichRowFromSignals(row, daySignals, report, componentId, municipality) {
  const analyzed = resolveAnalyzedAt(row.date, report, daySignals);
  row.analyzed_at = analyzed.analyzed_at;
  row.analyzed_at_label = analyzed.analyzed_at_label;

  const matches = searchSignals(daySignals, {
    component: componentId,
    municipality: municipality ?? undefined,
    limit: 25,
  });
  row.signal_count = matches.length;
  row.signal_excerpts = matches.slice(0, 2).map((s) => ({
    signal_id: s.signal_id,
    source_id: s.source_id ?? null,
    excerpt: clip(s.evidence, 200),
  }));
}

async function enrichRowFromPboReview(row, deps, date, municipality, componentId, gaps) {
  if (!municipality || !deps.isAnalyst || !deps.pboReportReviewService?.getReviewDetail) return;

  try {
    const detail = await deps.pboReportReviewService.getReviewDetail(date, municipality);
    row.pbo_review_snippet = extractPboReviewSnippet(detail, componentId);
  } catch {
    gaps.push(`pbo_review fetch failed for ${date}/${municipality}`);
  }
}

function createTimelineRow(date) {
  return {
    date,
    analyzed_at: null,
    analyzed_at_label: date,
    instrument: '—',
    pbo_avg: '—',
    signal_count: 0,
    signal_excerpts: [],
    narrative_excerpt: '—',
    pbo_text: '—',
    pbo_review_snippet: null,
  };
}

/**
 * @param {object} input
 * @param {string} input.component
 * @param {string} [input.municipality]
 * @param {string} [input.date_from]
 * @param {string} [input.date_to]
 * @param {object} deps
 * @param {boolean} [deps.includeScores]
 * @param {boolean} [deps.isAnalyst]
 * @param {() => object} [deps.getMunicipalityDashboard]
 * @param {object} [deps.pboReportReviewService]
 * @returns {Promise<object>}
 */
export async function buildComponentTimeline(input, deps = {}) {
  const componentId = String(input?.component ?? '').trim();
  if (!componentId) {
    return { error: 'component is required', rows: [], gaps: ['missing component'] };
  }

  const municipalityRaw = String(input?.municipality ?? '').trim();
  const dateFrom = input?.date_from ?? input?.dateFrom ?? null;
  const dateTo = input?.date_to ?? input?.dateTo ?? null;
  const includeScores = deps.includeScores === true;

  const dashboard = getCachedDashboard(deps.getMunicipalityDashboard);
  const pboKeys = dashboard?.municipalities ?? [];
  const municipality = municipalityRaw
    ? resolveMunicipalityName(municipalityRaw, { pboLookupKeys: pboKeys })
    : null;

  const dates = resolveDateWindow(dateFrom, dateTo, Boolean(municipality));
  const reportDates = new Set(listReportDates());
  const gaps = [];

  if (dates.length === 0) {
    gaps.push('no dates in requested window');
  }

  const windowFrom = dates[0] ?? dateFrom ?? null;
  const windowTo = dates.at(-1) ?? dateTo ?? null;
  const signalsInWindow = dates.length > 0
    ? loadSignals({ dateFrom: windowFrom, dateTo: windowTo })
    : [];

  const rows = [];

  for (const date of dates) {
    const row = createTimelineRow(date);
    const report = loadReport(date);
    enrichRowFromReport(row, report, componentId, includeScores, reportDates, gaps);
    enrichRowFromPbo(row, dashboard, municipality, componentId, reportDates, gaps);

    const daySignals = signalsForDate(signalsInWindow, date);
    enrichRowFromSignals(row, daySignals, report, componentId, municipality);
    await enrichRowFromPboReview(row, deps, date, municipality, componentId, gaps);

    rows.push(row);
  }

  const signalOnlyDates = dates.filter((d) => !reportDates.has(d));
  if (signalOnlyDates.length > 0) {
    gaps.push(`signal-only dates (no assessment report): ${signalOnlyDates.join(', ')}`);
  }

  return {
    component: componentId,
    municipality: municipality ?? null,
    municipality_query: municipalityRaw || null,
    date_from: dates[0] ?? dateFrom,
    date_to: dates.at(-1) ?? dateTo,
    date_count: dates.length,
    rows,
    gaps: [...new Set(gaps)],
  };
}

function formatTimelineSignalPart(row) {
  if (row.signal_count <= 0) return '0';
  const sourceId = row.signal_excerpts[0]?.source_id;
  if (!sourceId) return String(row.signal_count);
  return `${row.signal_count} sid=${sourceId}`;
}

function formatSignalExcerptLine(ex) {
  const sourceSuffix = ex.source_id ? ` [source_id=${ex.source_id}]` : '';
  return `  signal: ${ex.excerpt}${sourceSuffix}`;
}

function formatTimelineRowLine(row) {
  const when = row.analyzed_at_label ?? row.date;
  const sigPart = formatTimelineSignalPart(row);
  return (
    `${when} | ${row.instrument} | ${row.pbo_avg} | ${sigPart} | ` +
    `${clip(row.narrative_excerpt, 120)} | ${clip(row.pbo_text, 80)}`
  );
}

/**
 * @param {object} result from buildComponentTimeline
 * @returns {string}
 */
export function formatComponentTimeline(result) {
  if (result.error) return result.error;

  const muniPart = result.municipality ? ` @ ${result.municipality}` : '';
  const range = result.date_from && result.date_to
    ? `${result.date_from} → ${result.date_to}`
    : 'n/a';

  const lines = [
    `TIMELINE: ${result.component}${muniPart} (${range}, ${result.date_count} dates)`,
    'analyzed_at | instrument | pbo_avg | signals | narrative_excerpt | pbo_text',
  ];

  for (const row of result.rows) {
    lines.push(formatTimelineRowLine(row));
    if (row.pbo_review_snippet) {
      lines.push(`  pbo_review: ${row.pbo_review_snippet}`);
    }
    for (const ex of row.signal_excerpts) {
      lines.push(formatSignalExcerptLine(ex));
    }
  }

  if (result.gaps?.length) {
    lines.push(`DATA_GAPS: ${result.gaps.join('; ')}`);
  }

  return lines.join('\n');
}
