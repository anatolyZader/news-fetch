import { formatDate, formatPublishedDateTime } from './date.js';
import { formatTemplate } from './i18nFormat.js';

/**
 * @typedef {{
 *   date: string,
 *   generated_at?: string | null,
 *   assessment_days?: number | null,
 *   window_start?: string | null,
 *   window_end?: string | null,
 *   total_articles?: number | null,
 *   is_today?: boolean,
 * }} ReportEdition
 */

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
 * @param {ReportEdition | null | undefined} edition
 * @param {string | null | undefined} selectedDate null = latest
 * @param {ReportEdition[]} editions
 */
export function resolveActiveEdition(edition, selectedDate, editions) {
  if (edition && typeof edition === 'object') return edition;
  if (selectedDate) {
    return editions.find((e) => e.date === selectedDate) ?? { date: selectedDate };
  }
  return editions[0] ?? null;
}

