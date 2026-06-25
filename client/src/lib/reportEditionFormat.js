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
 * @param {import('../context/LanguageContext.jsx').TranslateFn} t
 * @param {number | null | undefined} days
 */
export function formatWindowDaysLabel(t, days) {
  if (days == null || !Number.isFinite(days)) {
    return t('report.edition.windowUnknown');
  }
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
 * @param {ReportEdition | null | undefined} edition
 */
export function editionRunDiffersFromAnchor(edition) {
  if (!edition?.generated_at || !edition?.date) return false;
  return edition.generated_at.slice(0, 10) !== edition.date;
}

/**
 * @param {ReportEdition | null | undefined} edition
 * @param {number} [sameDateCount]
 */
export function shouldLabelEditionRunTime(edition, sameDateCount = 1) {
  return Boolean(
    edition?.generated_at
    && (sameDateCount > 1 || editionRunDiffersFromAnchor(edition)),
  );
}

/**
 * Compact picker trigger: report date, optional multi-day range, optional relative run time.
 * @param {import('../context/LanguageContext.jsx').TranslateFn} t
 * @param {ReportEdition | null | undefined} edition
 * @param {{ showNewest?: boolean, sameDateCount?: number }} [options]
 * @returns {string[]}
 */
export function formatEditionPickerTriggerParts(t, edition, { showNewest = false, sameDateCount = 1 } = {}) {
  if (!edition) return [];
  const parts = [];
  if (showNewest) parts.push(t('report.edition.newest'));

  const start = edition.window_start;
  const end = edition.window_end ?? edition.date;
  const days = edition.assessment_days;
  const isMultiDay = (start && end && start !== end) || (days != null && days > 1);
  const showRunLabel = shouldLabelEditionRunTime(edition, sameDateCount);

  if (isMultiDay && start && end && start !== end) {
    parts.push(`${formatDate(start)}–${formatDate(end)}`);
  } else if (showRunLabel) {
    parts.push(formatTemplate(t('report.edition.reportForShort'), { date: formatDate(edition.date) }));
  } else {
    parts.push(formatDate(edition.date));
  }

  if (showRunLabel) {
    parts.push(formatTemplate(t('report.edition.runAtShort'), {
      time: formatPublishedDateTime(edition.generated_at),
    }));
  } else {
    const runRelative = edition.generated_at ? formatRelativeRunTime(edition.generated_at) : null;
    if (runRelative) parts.push(runRelative);
  }

  return parts;
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

