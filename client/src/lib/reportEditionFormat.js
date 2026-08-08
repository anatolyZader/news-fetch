import { formatDate, formatPublishedDateTime } from './date.js';
import { formatTemplate } from './i18nFormat.js';

/**
 * @typedef {{
 *   date: string,
 *   run_id?: string | null,
 *   generated_at?: string | null,
 *   assessment_days?: number | null,
 *   window_start?: string | null,
 *   window_end?: string | null,
 *   total_articles?: number | null,
 *   is_today?: boolean,
 * }} ReportEdition
 */

/**
 * @typedef {{ date: string, run_id?: string | null } | null} ReportEditionSelection
 */

/**
 * @param {ReportEdition | ReportEditionSelection | null | undefined} edition
 */
export function editionSelectionKey(edition) {
  if (!edition?.date) return '';
  const runId = edition.run_id;
  return runId ? `${edition.date}:${runId}` : edition.date;
}

/**
 * @param {ReportEdition | ReportEditionSelection | null | undefined} a
 * @param {ReportEdition | ReportEditionSelection | null | undefined} b
 */
export function editionsMatch(a, b) {
  if (!a?.date || !b?.date) return false;
  return editionSelectionKey(a) === editionSelectionKey(b);
}

/**
 * @param {{ t: (key: string, params?: Record<string, unknown>) => string, tp?: (key: string, count: number) => string }} langApi
 * @param {number | null | undefined} days
 */
export function formatWindowDaysLabel(langApi, days) {
  const t = typeof langApi === 'function' ? langApi : langApi.t;
  const tp = typeof langApi === 'function' ? null : langApi.tp;
  if (days == null || !Number.isFinite(days)) {
    return t('report.edition.windowUnknown');
  }
  if (tp) return tp('report.edition.windowDaysPlural', days);
  if (days === 1) return t('report.edition.windowSingle');
  return formatTemplate(t('report.edition.windowDays'), { n: String(days) });
}

/**
 * @param {import('../context/LanguageContext.jsx').TranslateFn} t
 * @param {{ window_start?: string | null, window_end?: string | null, assessment_days?: number | null }} edition
 */
export function formatWindowRangeLabel(t, edition) {
  const start = edition?.window_start;
  const end = edition?.window_end ?? edition?.date;
  const days = edition?.assessment_days;
  if (start && end && start !== end) {
    return formatTemplate(t('report.edition.includesSignals'), {
      start: formatDate(start),
      end: formatDate(end),
      days: days == null ? '?' : String(days),
    });
  }
  if (end) {
    return formatTemplate(t('report.edition.includesSingleDay'), { date: formatDate(end) });
  }
  return t('report.edition.windowUnknownHint');
}

/**
 * Compact signal-window phrase for the picker trigger.
 * @param {import('../context/LanguageContext.jsx').TranslateFn} t
 * @param {ReportEdition | null | undefined} edition
 */
export function formatEditionSignalsSummary(t, edition) {
  if (!edition) return null;
  const start = edition.window_start;
  const end = edition.window_end ?? edition.date;
  if (start && end && start !== end) {
    return formatTemplate(t('report.edition.signalsShort'), {
      start: formatDate(start),
      end: formatDate(end),
    });
  }
  if (edition.assessment_days == null && !start) {
    return t('report.edition.windowUnknownHint');
  }
  return formatTemplate(t('report.edition.signalsShortSingle'), { date: formatDate(end ?? edition.date) });
}

/**
 * Prefer report JSON `generated_at`; otherwise synthesize from run_id token.
 * Supports two run_id forms:
 *   - Labeled (current): `2026-08-07T0940Z` → `2026-08-07T09:40:00.000Z`
 *   - Legacy compact:    `0940` (HHmm)      → `{edition.date}T09:40:00.000Z`
 * @param {ReportEdition | null | undefined} edition
 * @returns {string | null} ISO-8601 timestamp
 */
export function resolveEditionProducedAt(edition) {
  if (!edition) return null;
  if (typeof edition.generated_at === 'string' && edition.generated_at.trim()) {
    return edition.generated_at.trim();
  }
  const runId = edition.run_id;
  if (typeof runId !== 'string') return null;
  // Current labeled format: "2026-08-07T0940Z"
  if (/^\d{4}-\d{2}-\d{2}T\d{4}Z$/.test(runId)) {
    return `${runId.slice(0, 10)}T${runId.slice(11, 13)}:${runId.slice(13, 15)}:00.000Z`;
  }
  // Legacy compact format: "0940"
  const date = edition.date;
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!/^\d{4}$/.test(runId) || runId === '0000') return null;
  return `${date}T${runId.slice(0, 2)}:${runId.slice(2, 4)}:00.000Z`;
}

/**
 * @param {ReportEdition | null | undefined} edition
 */
export function editionRunDiffersFromAnchor(edition) {
  const producedAt = resolveEditionProducedAt(edition);
  if (!producedAt || !edition?.date) return false;
  return producedAt.slice(0, 10) !== edition.date;
}

/**
 * Always label when a production timestamp is known (JSON or filename run id).
 * @param {ReportEdition | null | undefined} edition
 * @param {number} [_sameDateCount] retained for call-site compatibility
 */
export function shouldLabelEditionRunTime(edition, _sameDateCount = 1) {
  return resolveEditionProducedAt(edition) != null;
}

/**
 * Closed picker trigger — single short label; full edition context is in ReportEditionContextBar.
 * @param {import('../context/LanguageContext.jsx').TranslateFn} t
 * @param {ReportEdition | null | undefined} edition
 * @returns {string[]}
 */
export function formatEditionPickerTriggerParts(t, edition) {
  if (!edition) return [];
  return [t('report.edition.pickerShort')];
}

/**
 * @param {string | null | undefined} iso
 */
export function formatRelativeRunTime(iso) {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;
  const diffMs = Date.now() - then.getTime();
  if (diffMs < 0) return formatPublishedDateTime(iso);
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatPublishedDateTime(iso);
}

/**
 * @param {ReportEdition | null | undefined} loadedEdition
 * @param {ReportEditionSelection} selectedEdition null = newest
 * @param {ReportEdition[]} editions
 */
export function resolveActiveEdition(loadedEdition, selectedEdition, editions) {
  if (loadedEdition && typeof loadedEdition === 'object') return loadedEdition;
  if (selectedEdition?.date) {
    return editions.find((e) => editionsMatch(e, selectedEdition)) ?? selectedEdition;
  }
  return editions[0] ?? null;
}

/**
 * Count editions sharing the same anchor date.
 * @param {ReportEdition[]} editions
 * @param {string | null | undefined} date
 */
export function countEditionsForDate(editions, date) {
  if (!date) return 0;
  return editions.filter((e) => e.date === date).length;
}

