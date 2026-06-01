/**
 * Assembles digest text/html parts from report and pool dashboards.
 */

import { LABELS } from '../domain/copy/mailingLabels.js';
import {
  escapeHtml,
  buildReportText,
  buildReportHtml,
  buildNaftaliText,
  buildNaftaliHtml,
  buildEducationText,
  buildEducationHtml,
} from './mailDigestRenderer.js';

/**
 * @param {object} cached  Result of getCachedReport()
 * @returns {object | null}
 */
export function getAssessmentFromCache(cached) {
  if (!cached) return null;
  if (cached.assessment && typeof cached.assessment === 'object') return cached.assessment;
  if (Array.isArray(cached.components)) return cached;
  return null;
}

export function appendDashboardErrorParts(title, msg, partsText, partsHtml) {
  partsText.push(`=== ${title} ===\n(Error: ${msg})`);
  partsHtml.push(`<h2>${escapeHtml(title)}</h2><p style="color:#b00">Error: ${escapeHtml(msg)}</p>`);
}

export async function appendDashboardParts({ enabled, loadDashboard, buildText, buildHtml, title, labels, lang, dir, parts }) {
  if (!enabled) return;
  const { text: partsText, html: partsHtml } = parts;
  try {
    const dash = await loadDashboard();
    partsText.push(buildText(dash, labels, lang));
    partsHtml.push(buildHtml(dash, labels, lang, dir));
  } catch (e) {
    appendDashboardErrorParts(title, e?.message ?? 'failed to load', partsText, partsHtml);
  }
}

export async function appendReportDigestParts({ products, lang, labels, dir, parts, getCachedReport, translateReport }) {
  if (!products.report) return;
  const { text: partsText, html: partsHtml } = parts;
  const cached = getCachedReport();
  let assessment = getAssessmentFromCache(cached);
  if (lang !== 'en' && assessment && translateReport) {
    try {
      assessment = await translateReport(assessment, lang);
    } catch {
      // Translation failures should not block digest delivery; fall back to source language.
    }
  }
  if (assessment) {
    partsText.push(buildReportText({ cached, assessment, labels, lang }));
    partsHtml.push(buildReportHtml({ cached, assessment, labels, lang, dir }));
    return;
  }
  partsText.push(`=== ${labels.reportTitle} ===\n(${labels.noReport})`);
  partsHtml.push(`<h2>${escapeHtml(labels.reportTitle)}</h2><p><em>${escapeHtml(labels.noReport)}</em></p>`);
}

export function normalizeLanguage(lang) {
  const v = String(lang ?? 'en').trim().toLowerCase();
  return ['en', 'he', 'ru'].includes(v) ? v : 'en';
}

/**
 * @param {object} opts
 * @param {() => any} opts.getCachedReport
 * @param {(report: object, lang: string) => Promise<object>} [opts.translateReport]
 * @param {{ getNaftaliDashboard: Function, getEducationDashboard: Function }} opts.poolService
 */
export async function buildDigestParts(opts, products, language = 'en') {
  const { getCachedReport, translateReport, poolService } = opts;
  const lang = normalizeLanguage(language);
  const labels = LABELS[lang] ?? LABELS.en;
  const dir = lang === 'he' ? 'rtl' : 'ltr';
  const partsText = [];
  const partsHtml = [];

  const parts = { text: partsText, html: partsHtml };

  await appendReportDigestParts({
    products, lang, labels, dir, parts, getCachedReport, translateReport,
  });

  await appendDashboardParts({
    enabled: products.naftali,
    loadDashboard: () => poolService.getNaftaliDashboard({ forceRefresh: false }),
    buildText: buildNaftaliText,
    buildHtml: buildNaftaliHtml,
    title: labels.naftaliTitle,
    labels,
    lang,
    dir,
    parts,
  });

  await appendDashboardParts({
    enabled: products.education,
    loadDashboard: () => poolService.getEducationDashboard({ forceRefresh: false }),
    buildText: buildEducationText,
    buildHtml: buildEducationHtml,
    title: labels.educationTitle,
    labels,
    lang,
    dir,
    parts,
  });

  if (products.platform) {
    const note = 'Product and operational notices: none configured for this digest. This section may include non-data announcements in the future.';
    partsText.push(`=== ${labels.platformTitle} ===\n\n${note}`);
    partsHtml.push(`<h2>${escapeHtml(labels.platformTitle)}</h2><p>${escapeHtml(note)}</p>`);
  }

  return {
    text: partsText.join('\n\n'),
    html: `<!DOCTYPE html><html lang="${lang}" dir="${dir}"><body style="font-family:system-ui,sans-serif;line-height:1.45">${partsHtml.join('<hr/>')}</body></html>`,
  };
}
