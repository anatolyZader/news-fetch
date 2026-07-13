/**
 * HTML/text builders for mailing digests.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { closedSignalsDir } from '../../resilience_scorer/index.js';
import { getMunicipalityDashboard } from '../../pbo_report/index.js';
import {
  deriveInstrumentState,
  operatorAssessmentSummary,
} from '../../resilience_scorer/index.js';
import {
  COMPONENT_LABELS,
  POOL_COLORS,
  POOL_LABELS,
  NAF_SEVERITY_KEYS,
  NAF_VULN_KEYS,
  DEFAULT_APP_BASE_URL,
} from '../domain/copy/mailingLabels.js';

export function escapeHtml(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&#39;');
}

function truncate(str, max) {
  const t = String(str ?? '');
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n… [truncated ${t.length - max} characters]`;
}

function displayValue(v) {
  if (v == null || v === '') return '—';
  return String(v);
}

function appBaseUrl() {
  return (process.env.APP_BASE_URL || process.env.PUBLIC_APP_URL || DEFAULT_APP_BASE_URL).trim().replace(/\/+$/, '');
}

function appLink(params) {
  const query = new URLSearchParams(params);
  return `${appBaseUrl()}/?${query.toString()}`;
}

function ctaButtonHtml(href, label) {
  return `
    <a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" style="display:inline-block;text-decoration:none;border-radius:999px;background:#ffffff;color:#465f80;border:1px solid #b7cad8;padding:9px 14px;font-size:13px;font-weight:800">
      ${escapeHtml(label)}
    </a>
  `;
}

function shortDate(date) {
  const s = String(date ?? '');
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(5) : displayValue(s);
}

function labelPool(key, lang) {
  return POOL_LABELS[lang]?.[key] ?? POOL_LABELS.en[key] ?? String(key ?? '').replaceAll('_', ' ');
}

function sumValues(obj) {
  return Object.values(obj ?? {}).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

function dateRangeText(range) {
  if (!range?.from && !range?.to) return '—';
  if (range?.from === range?.to) return displayValue(range.from);
  return `${displayValue(range?.from)} - ${displayValue(range?.to)}`;
}

function poolKpiHtml(kpis) {
  return `
    <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:10px 0;margin:0 -10px 18px -10px">
      <tbody>
        <tr>
          ${kpis.map(({ label, value }) => `
            <td style="width:${Math.floor(100 / Math.max(1, kpis.length))}%;padding:14px 16px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;vertical-align:top">
              <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:6px">${escapeHtml(label)}</div>
              <div style="font-size:20px;line-height:1.2;font-weight:800;color:#0f172a">${escapeHtml(displayValue(value))}</div>
            </td>
          `).join('')}
        </tr>
      </tbody>
    </table>
  `;
}

function legendHtml(items) {
  return `
    <div style="margin:8px 0 16px 0;padding:10px 12px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;text-align:center">
      ${items.map(({ label, color }) => `
        <span style="display:inline-block;margin:3px 18px;font-size:12px;color:#475569;white-space:nowrap">
          <span style="display:inline-block;width:10px;height:10px;border-radius:999px;background:${color};margin:0 5px 0 0;vertical-align:-1px"></span>${escapeHtml(label)}
        </span>
      `).join('')}
    </div>
  `;
}

function stackedBarHtml(dist, segments) {
  const total = sumValues(dist);
  if (total <= 0) return '<div style="height:12px;border-radius:999px;background:#e2e8f0"></div>';
  return `
    <div style="height:13px;border-radius:999px;background:#e2e8f0;overflow:hidden;white-space:nowrap">
      ${segments.map(({ key, color }) => {
    const value = Number(dist?.[key]) || 0;
    if (value <= 0) return '';
    const pct = Math.max(2, Math.round((value / total) * 100));
    return `<span style="display:inline-block;height:13px;width:${pct}%;background:${color};vertical-align:top"></span>`;
  }).join('')}
    </div>
  `;
}

function trendStackTableHtml({ title, rows, labelForRow, distForRow, segments, dir }) {
  const visibleRows = rows.slice(-6);
  return `
    <section style="margin:0 0 14px 0;padding:16px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff">
      <h3 style="margin:0 0 10px 0;font-size:16px;color:#0f172a">${escapeHtml(title)}</h3>
      <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">
        <tbody>
          ${visibleRows.map((row) => {
    const dist = distForRow(row) ?? {};
    return `
            <tr>
              <td style="width:82px;padding:7px 10px 7px 0;color:#64748b;font-size:12px;font-weight:700;text-align:${dir === 'rtl' ? 'right' : 'left'};white-space:nowrap">${escapeHtml(labelForRow(row))}</td>
              <td style="padding:7px 0">${stackedBarHtml(dist, segments)}</td>
              <td style="width:42px;padding:7px 0 7px 10px;color:#64748b;font-size:12px;text-align:${dir === 'rtl' ? 'left' : 'right'}">${sumValues(dist)}</td>
            </tr>
          `;
  }).join('')}
        </tbody>
      </table>
    </section>
  `;
}

function horizontalBarsHtml({ title, dist, labelForKey, color = POOL_COLORS.blue, maxRows = 8, dir }) {
  const rows = Object.entries(dist ?? {})
    .filter(([, v]) => Number(v) > 0)
    .sort(([, a], [, b]) => Number(b) - Number(a))
    .slice(0, maxRows);
  const max = Math.max(1, ...rows.map(([, v]) => Number(v) || 0));
  return `
    <section style="margin:0 0 14px 0;padding:16px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff">
      <h3 style="margin:0 0 10px 0;font-size:16px;color:#0f172a">${escapeHtml(title)}</h3>
      ${rows.length === 0 ? '<p style="margin:0;color:#64748b"><em>—</em></p>' : `
        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">
          <tbody>
            ${rows.map(([key, value]) => `
              <tr>
                <td style="width:38%;padding:7px 10px 7px 0;color:#475569;font-size:12px;font-weight:700;text-align:${dir === 'rtl' ? 'right' : 'left'}">${escapeHtml(labelForKey(key))}</td>
                <td style="padding:7px 0">
                  <div style="height:13px;border-radius:999px;background:#e2e8f0;overflow:hidden">
                    <div style="height:13px;width:${Math.max(3, Math.round((Number(value) / max) * 100))}%;background:${color};border-radius:999px"></div>
                  </div>
                </td>
                <td style="width:42px;padding:7px 0 7px 10px;color:#0f172a;font-size:12px;font-weight:800;text-align:${dir === 'rtl' ? 'left' : 'right'}">${escapeHtml(displayValue(value))}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function commentsTableHtml({ title, rows, columns, dir, reverseColumns = false }) {
  const visibleRows = (rows ?? []).slice(0, 6);
  const displayColumns = (dir === 'rtl' || reverseColumns) ? [...columns].reverse() : columns;
  return `
    <section style="margin:0 0 14px 0;padding:16px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff">
      <h3 style="margin:0 0 10px 0;font-size:16px;color:#0f172a">${escapeHtml(title)}</h3>
      ${visibleRows.length === 0 ? '<p style="margin:0;color:#64748b"><em>—</em></p>' : `
        <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:collapse">
          <thead>
            <tr>
              ${displayColumns.map((c) => `<th style="padding:8px 9px;background:#f1f5f9;color:#64748b;font-size:12px;text-align:${dir === 'rtl' ? 'right' : 'left'}">${escapeHtml(c.label)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${visibleRows.map((row) => `
              <tr>
                ${displayColumns.map((c) => `<td style="padding:9px;border-top:1px solid #e2e8f0;color:#0f172a;font-size:13px;vertical-align:top;text-align:${dir === 'rtl' ? 'right' : 'left'}">${escapeHtml(displayValue(c.value(row)))}</td>`).join('')}
              </tr>
            `).join('')}
          </tbody>
        </table>
      `}
    </section>
  `;
}

function paragraphHtml(text) {
  const chunks = String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (chunks.length === 0) return '<p style="margin:0;color:#64748b"><em>—</em></p>';
  return chunks
    .map((p) => `<p style="margin:0 0 12px 0">${escapeHtml(p).replaceAll('\n', '<br/>')}</p>`)
    .join('');
}

function componentLabel(componentId, lang) {
  return COMPONENT_LABELS[lang]?.[componentId]
    ?? COMPONENT_LABELS.en[componentId]
    ?? String(componentId ?? '').replaceAll('_', ' ');
}

function extractSourceFileDates(sourceFiles = []) {
  return [...new Set(
    sourceFiles
      .map((f) => /(\d{4}-\d{2}-\d{2})/.exec(String(f))?.[1])
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
}

function countArticlesInSourceFile(fileName) {
  const path = resolve(import.meta.dirname, '../../news-sites/articles_extracted', fileName);
  if (!existsSync(path)) return null;
  try {
    const md = readFileSync(path, 'utf8');
    const relevant = /→\s*(\d+)\s+relevant/i.exec(md)?.[1];
    if (relevant) return Number(relevant);
    return (md.match(/^##\s+\d+\./gm) ?? []).length;
  } catch {
    return null;
  }
}

function signalTotalsByDate(sourceType, sourceFiles) {
  const signalsDir = closedSignalsDir();
  const wantedFiles = new Set(sourceFiles.map(String));
  const totals = new Map();
  if (!existsSync(signalsDir) || wantedFiles.size === 0) return totals;

  try {
    for (const file of readdirSync(signalsDir)) {
      const match = new RegExp(String.raw`^signals-${sourceType}-(\d{4}-\d{2}-\d{2})\.json$`).exec(file);
      if (!match) continue;
      const data = JSON.parse(readFileSync(resolve(signalsDir, file), 'utf8'));
      const included = (data.source_files ?? []).some((f) => wantedFiles.has(String(f)));
      if (!included) continue;
      totals.set(match[1], Number(data.total_articles) || 0);
    }
  } catch {
    return totals;
  }

  return totals;
}

function buildDayBreakdown(cached, assessment) {
  const sourceFiles = Array.isArray(cached?.source_files) ? cached.source_files : [];
  const articleCounts = signalTotalsByDate('news', sourceFiles);
  const pboCounts = signalTotalsByDate('pbo', sourceFiles);
  const fileDates = extractSourceFileDates(sourceFiles);
  let dates = [...new Set([
    ...fileDates,
    ...articleCounts.keys(),
    ...pboCounts.keys(),
    cached?.reportDate ?? assessment?.date,
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));

  for (const f of sourceFiles) {
    const date = /articles-homefront-(\d{4}-\d{2}-\d{2})\.md$/.exec(String(f))?.[1];
    if (!date || articleCounts.has(date)) continue;
    const count = countArticlesInSourceFile(f);
    if (count != null) articleCounts.set(date, (articleCounts.get(date) ?? 0) + count);
  }

  if (pboCounts.size === 0 && sourceFiles.some((f) => String(f).toLowerCase().endsWith('.xlsx'))) {
    try {
      const pboDashboard = getMunicipalityDashboard();
      for (const day of pboDashboard.days ?? []) {
        if (!day?.date || !dates.includes(day.date)) continue;
        pboCounts.set(day.date, day.municipalities?.length ?? 0);
      }
    } catch {
      /* PBO metadata is useful but non-critical for email delivery. */
    }
  }

  dates = [...new Set([...dates, ...pboCounts.keys()])].sort((a, b) => a.localeCompare(b));

  return dates.map((date) => ({
    date,
    articles: articleCounts.get(date) ?? 0,
    pboReports: pboCounts.get(date) ?? 0,
  }));
}

export function buildReportText({ cached, assessment, labels, lang }) {
  const reportDate = cached?.reportDate ?? assessment?.date ?? 'unknown date';
  const reportLink = appLink({ section: 'report' });
  const generatedAt = cached?.generated_at ?? cached?.generatedAt ?? '';
  const totalArticles = assessment?.total_articles_analyzed ?? cached?.total_articles_analyzed ?? '';
  const dayBreakdown = buildDayBreakdown(cached, assessment);
  const totalPboReports = dayBreakdown.reduce((sum, d) => sum + (Number(d.pboReports) || 0), 0);
  const instrumentLine = operatorAssessmentSummary(assessment);
  const comps = Array.isArray(assessment?.components) ? assessment.components : [];
  const lines = [
    `=== ${labels.reportTitle} (${reportDate}) ===`,
    `${labels.openInApp}: ${reportLink}`,
    '',
    `${labels.metadata}:`,
    `- ${labels.reportDate}: ${displayValue(reportDate)}`,
    `- ${labels.generatedAt}: ${displayValue(generatedAt)}`,
    `- ${labels.totalArticles}: ${displayValue(totalArticles)}`,
    `- ${labels.pboReports}: ${displayValue(totalPboReports)}`,
    `- ${labels.instrumentSummary}: ${displayValue(instrumentLine)}`,
    '',
    `${labels.dataByDay}:`,
    ...dayBreakdown.map((d) => `- ${d.date}: ${labels.articles} ${displayValue(d.articles)}; ${labels.pboReports} ${displayValue(d.pboReports)}`),
    '',
    `${labels.executiveSummary}:`,
    String(assessment?.cross_component_synthesis ?? '').trim() || `(${labels.noSummary})`,
    '',
    `${labels.componentNarratives}:`,
  ];
  for (const c of comps) {
    const inst = c.instrument ?? deriveInstrumentState(c);
    lines.push(
      '',
      `--- ${componentLabel(c.component_id, lang)} (${labels.confidence} ${inst.confidence}, sufficiency ${inst.evidence_sufficiency}) ---`,
      truncate(String(c.narrative ?? ''), 6000),
    );
  }
  return lines.join('\n');
}

export function buildReportHtml({ cached, assessment, labels, lang, dir }) {
  const reportDate = cached?.reportDate ?? assessment?.date ?? 'unknown date';
  const reportLink = appLink({ section: 'report' });
  const generatedAt = cached?.generated_at ?? cached?.generatedAt ?? '';
  const totalArticles = assessment?.total_articles_analyzed ?? cached?.total_articles_analyzed ?? '';
  const dayBreakdown = buildDayBreakdown(cached, assessment);
  const totalPboReports = dayBreakdown.reduce((sum, d) => sum + (Number(d.pboReports) || 0), 0);
  const instrumentLine = operatorAssessmentSummary(assessment);
  const comps = Array.isArray(assessment?.components) ? assessment.components : [];
  const metaRows = [
    [labels.reportDate, reportDate],
    [labels.generatedAt, generatedAt],
    [labels.totalArticles, totalArticles],
    [labels.pboReports, totalPboReports],
    [labels.instrumentSummary, instrumentLine],
  ];

  const componentCards = comps.map((c) => {
    const inst = c.instrument ?? deriveInstrumentState(c);
    const componentLink = appLink({ section: 'report', component: c.component_id ?? '' });
    const instBadge = `${inst.confidence} · ${inst.evidence_sufficiency}${inst.contested ? ' · contested' : ''}`;
    return `
      <section style="margin:0 0 16px 0;padding:18px 20px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff">
        <div style="display:flex;align-items:center;justify-content:flex-start;gap:14px;margin-bottom:10px">
          <h3 style="margin:0;font-size:18px;line-height:1.3;color:#0f172a">${escapeHtml(componentLabel(c.component_id, lang))}</h3>
          <span style="display:inline-block;white-space:nowrap;border:1px solid #cbd5e1;background:#f8fafc;color:#475569;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:600;${dir === 'rtl' ? 'margin-right:14px' : 'margin-left:14px'}">
            ${escapeHtml(instBadge)}
          </span>
        </div>
        <div style="font-size:15px;line-height:1.65;color:#1e293b">${paragraphHtml(truncate(String(c.narrative ?? ''), 6000))}</div>
        <div style="margin-top:10px">${ctaButtonHtml(componentLink, labels.viewDetails)}</div>
      </section>
    `;
  }).join('');

  return `
    <div style="margin:0 auto;max-width:760px;background:#f8fafc;padding:28px 18px" dir="${dir}">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;overflow:hidden;box-shadow:0 12px 34px rgba(15,23,42,0.08)">
        <header style="padding:28px 30px;background:linear-gradient(135deg,#e5f0f6,#c8deeb);color:#1a1d2e">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#5b7d9c;margin-bottom:8px">Vibes Witch</div>
          <h1 style="margin:0;font-size:28px;line-height:1.2">${escapeHtml(labels.reportTitle)}</h1>
          <div style="margin-top:14px">
            <span style="display:inline-block;border:1px solid #b7cad8;background:rgba(255,255,255,.55);border-radius:999px;padding:6px 12px;font-size:14px;margin:0 10px 10px 0">
              ${escapeHtml(labels.reportDate)}: ${escapeHtml(displayValue(reportDate))}
            </span>
            ${ctaButtonHtml(reportLink, labels.openInApp)}
          </div>
        </header>

        <main style="padding:26px 30px">
          <section style="margin:0 0 24px 0">
            <h2 style="margin:0 0 12px 0;font-size:18px;color:#0f172a">${escapeHtml(labels.metadata)}</h2>
            <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#ffffff">
              <tbody>
                ${metaRows.map(([k, v], idx) => `
                  <tr>
                    <td style="width:38%;padding:12px 14px;border-bottom:${idx === metaRows.length - 1 ? '0' : '1px solid #e2e8f0'};background:#f8fafc;color:#64748b;font-size:13px;font-weight:700">${escapeHtml(k)}</td>
                    <td style="padding:12px 14px;border-bottom:${idx === metaRows.length - 1 ? '0' : '1px solid #e2e8f0'};color:#0f172a;font-size:14px;font-weight:600">
                      ${escapeHtml(displayValue(v))}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </section>

          <section style="margin:0 0 24px 0">
            <h2 style="margin:0 0 12px 0;font-size:18px;color:#0f172a">${escapeHtml(labels.dataByDay)}</h2>
            <table role="presentation" cellspacing="0" cellpadding="0" style="width:100%;border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;background:#ffffff">
              <thead>
                <tr>
                  <th style="text-align:${dir === 'rtl' ? 'right' : 'left'};padding:11px 14px;background:#f1f5f9;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(labels.date)}</th>
                  <th style="text-align:${dir === 'rtl' ? 'right' : 'left'};padding:11px 14px;background:#f1f5f9;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(labels.articles)}</th>
                  <th style="text-align:${dir === 'rtl' ? 'right' : 'left'};padding:11px 14px;background:#f1f5f9;color:#475569;font-size:12px;text-transform:uppercase;letter-spacing:.04em">${escapeHtml(labels.pboReports)}</th>
                </tr>
              </thead>
              <tbody>
                ${dayBreakdown.map((d, idx) => `
                  <tr>
                    <td style="padding:12px 14px;border-top:${idx === 0 ? '0' : '1px solid #e2e8f0'};color:#0f172a;font-weight:700">${escapeHtml(displayValue(d.date))}</td>
                    <td style="padding:12px 14px;border-top:${idx === 0 ? '0' : '1px solid #e2e8f0'};color:#0f172a">${escapeHtml(displayValue(d.articles))}</td>
                    <td style="padding:12px 14px;border-top:${idx === 0 ? '0' : '1px solid #e2e8f0'};color:#0f172a">${escapeHtml(displayValue(d.pboReports))}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </section>

          <section style="margin:0 0 24px 0;padding:20px 22px;border-radius:18px;background:#eef6ff;border:1px solid #bfdbfe">
            <h2 style="margin:0 0 12px 0;font-size:20px;color:#0f172a">${escapeHtml(labels.executiveSummary)}</h2>
            <div style="font-size:15px;line-height:1.7;color:#1e293b">
              ${paragraphHtml(String(assessment?.cross_component_synthesis ?? '').trim() || labels.noSummary)}
            </div>
          </section>

          <section>
            <h2 style="margin:0 0 14px 0;font-size:20px;color:#0f172a">${escapeHtml(labels.componentNarratives)}</h2>
            ${componentCards || `<p style="margin:0;color:#64748b"><em>${escapeHtml(labels.noReport)}</em></p>`}
          </section>
        </main>
      </div>
    </div>
  `;
}

function buildPoolShellHtml({ title, subtitle, kpis, body, dir, href, ctaLabel }) {
  return `
    <div style="margin:0 auto;max-width:760px;background:#f8fafc;padding:24px 18px" dir="${dir}">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;overflow:hidden;box-shadow:0 12px 34px rgba(15,23,42,0.08)">
        <header style="padding:24px 28px;background:linear-gradient(135deg,#f8fafc,#eef6ff);color:#0f172a;border-bottom:1px solid #dbeafe">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin-bottom:8px">Vibes Witch</div>
          <h2 style="margin:0;font-size:24px;line-height:1.2;color:#0f172a">${escapeHtml(title)}</h2>
          <div style="margin-top:12px">
            ${subtitle ? `<span style="display:inline-block;font-size:14px;color:#475569;margin:0 10px 10px 0">${escapeHtml(subtitle)}</span>` : ''}
            ${href ? ctaButtonHtml(href, ctaLabel) : ''}
          </div>
        </header>
        <main style="padding:24px 28px">
          ${poolKpiHtml(kpis)}
          ${body}
        </main>
      </div>
    </div>
  `;
}

export function buildNaftaliText(dashboard, labels, lang) {
  const l = (key) => labelPool(key, lang);
  const link = appLink({ section: 'pools', pool: 'naftali' });
  const summary = dashboard?.summary;
  if (!summary) return `=== ${labels.naftaliTitle} ===\n(${l('noData')})`;
  const latest = dashboard.trends?.at(-1);
  const lines = [
    `=== ${labels.naftaliTitle} ===`,
    `${labels.openInApp}: ${link}`,
    `${l('totalResponses')}: ${displayValue(summary.totalResponses)}`,
    `${l('weeks')}: ${displayValue(summary.totalWeeks)}`,
    `${l('municipalities')}: ${displayValue(dashboard.municipalities?.length)}`,
    `${l('dateRange')}: ${dateRangeText(summary.dateRange)}`,
    '',
    `${l('vulnerablePopulations')}:`,
    ...NAF_VULN_KEYS.map((key) => `- ${l(key)}: ${displayValue(latest?.vulnTotals?.[key])}`),
    '',
    `${l('challengesNeeds')}:`,
    ...(dashboard.recentComments ?? []).slice(0, 6).map((c) => `- ${displayValue(c.municipality)}: ${displayValue(c.mainChallenge)} / ${displayValue(c.urgentNeeds)}`),
  ];
  return lines.join('\n');
}

export function buildNaftaliHtml(dashboard, labels, lang, dir) {
  const l = (key) => labelPool(key, lang);
  const link = appLink({ section: 'pools', pool: 'naftali' });
  const summary = dashboard?.summary;
  if (!summary) return `<h2>${escapeHtml(labels.naftaliTitle)}</h2><p><em>${escapeHtml(l('noData'))}</em></p>`;

  const severitySegments = [
    { key: 'high', label: l('high'), color: POOL_COLORS.red },
    { key: 'medium', label: l('medium'), color: POOL_COLORS.amber },
    { key: 'low', label: l('low'), color: POOL_COLORS.green },
    { key: 'none', label: l('none'), color: POOL_COLORS.gray },
  ];
  const latest = dashboard.trends?.at(-1) ?? {};
  const kpis = [
    { label: l('totalResponses'), value: summary.totalResponses },
    { label: l('weeks'), value: summary.totalWeeks },
    { label: l('municipalities'), value: dashboard.municipalities?.length ?? summary.municipalities?.length },
    { label: l('dateRange'), value: dateRangeText(summary.dateRange) },
  ];
  const severityCards = NAF_SEVERITY_KEYS.map((key) => trendStackTableHtml({
    title: l(key),
    rows: dashboard.trends ?? [],
    labelForRow: (row) => row.week == null ? shortDate(row.dateFrom) : `W${row.week}`,
    distForRow: (row) => row.severityDist?.[key],
    segments: severitySegments,
    dir,
  })).join('');
  const vulnDist = Object.fromEntries(NAF_VULN_KEYS.map((key) => [key, latest.vulnTotals?.[key] ?? 0]));
  const body = `
    <section style="margin:0 0 20px 0">
      <h3 style="margin:0 0 8px 0;font-size:18px;color:#0f172a">${escapeHtml(l('severityTrends'))}</h3>
      ${legendHtml(severitySegments)}
      ${severityCards}
    </section>
    ${horizontalBarsHtml({
    title: l('vulnerablePopulations'),
    dist: vulnDist,
    labelForKey: l,
    color: POOL_COLORS.blue,
    dir,
  })}
    ${commentsTableHtml({
    title: l('challengesNeeds'),
    rows: dashboard.recentComments,
    columns: [
      { label: l('municipality'), value: (r) => r.municipality },
      { label: l('challenge'), value: (r) => r.mainChallenge },
      { label: l('urgentNeeds'), value: (r) => r.urgentNeeds },
    ],
    dir,
  })}
  `;

  return buildPoolShellHtml({
    title: labels.naftaliTitle,
    subtitle: dateRangeText(summary.dateRange),
    kpis,
    body,
    dir,
    href: link,
    ctaLabel: labels.openInApp,
  });
}

export function buildEducationText(dashboard, labels, lang) {
  const l = (key) => labelPool(key, lang);
  const link = appLink({ section: 'pools', pool: 'education' });
  const summary = dashboard?.summary;
  if (!summary) return `=== ${labels.educationTitle} ===\n(${l('noData')})`;
  const lines = [
    `=== ${labels.educationTitle} ===`,
    `${labels.openInApp}: ${link}`,
    `${l('totalResponses')}: ${displayValue(summary.totalResponses)}`,
    `${l('latestSession')}: ${displayValue(summary.latestDate)}`,
    `${l('dateRange')}: ${dateRangeText(summary.dateRange)}`,
    `${l('settlements')}: ${displayValue(summary.settlements?.length)}`,
    '',
    `${l('concerningTrends')}:`,
    ...Object.entries(dashboard.distributions?.concerningTrends ?? {})
      .sort(([, a], [, b]) => Number(b) - Number(a))
      .slice(0, 8)
      .map(([key, value]) => `- ${l(key)}: ${value}`),
    '',
    `${l('openResponses')}:`,
    ...(dashboard.recentComments ?? []).slice(0, 6).map((c) => `- ${displayValue(c.date)} ${displayValue(c.settlement)}: ${displayValue(c.comment)}`),
  ];
  return lines.join('\n');
}

export function buildEducationHtml(dashboard, labels, lang, dir) {
  const l = (key) => labelPool(key, lang);
  const link = appLink({ section: 'pools', pool: 'education' });
  const summary = dashboard?.summary;
  if (!summary) return `<h2>${escapeHtml(labels.educationTitle)}</h2><p><em>${escapeHtml(l('noData'))}</em></p>`;

  const copingSegments = [
    { key: 'indifferent', label: l('indifferent'), color: POOL_COLORS.gray },
    { key: 'coping_easily', label: l('coping_easily'), color: POOL_COLORS.green },
    { key: 'struggling_somewhat', label: l('struggling_somewhat'), color: POOL_COLORS.amber },
    { key: 'struggling_greatly', label: l('struggling_greatly'), color: POOL_COLORS.red },
    { key: 'other', label: l('other'), color: POOL_COLORS.grayLight },
  ];
  const freqSegments = [
    { key: 'high', label: l('high'), color: POOL_COLORS.red },
    { key: 'low', label: l('low'), color: POOL_COLORS.amber },
    { key: 'rarely', label: l('rarely'), color: POOL_COLORS.green },
  ];
  const interventionSegments = [
    { key: 'yes', label: l('yes'), color: POOL_COLORS.red },
    { key: 'maybe', label: l('maybe'), color: POOL_COLORS.amber },
    { key: 'no', label: l('no'), color: POOL_COLORS.green },
  ];
  const kpis = [
    { label: l('totalResponses'), value: summary.totalResponses },
    { label: l('latestSession'), value: summary.latestDate },
    { label: l('dateRange'), value: dateRangeText(summary.dateRange) },
    { label: l('settlements'), value: summary.settlements?.length ?? 0 },
  ];
  const body = `
    <section style="margin:0 0 20px 0">
      <h3 style="margin:0 0 8px 0;font-size:18px;color:#0f172a">${escapeHtml(l('copingOverTime'))}</h3>
      ${legendHtml(copingSegments)}
      ${trendStackTableHtml({
    title: l('copingOverTime'),
    rows: dashboard.trends ?? [],
    labelForRow: (row) => shortDate(row.date),
    distForRow: (row) => row.copingDist,
    segments: copingSegments,
    dir,
  })}
    </section>
    ${trendStackTableHtml({
    title: l('streetMovement'),
    rows: dashboard.trends ?? [],
    labelForRow: (row) => shortDate(row.date),
    distForRow: (row) => row.streetMovementDist,
    segments: freqSegments,
    dir,
  })}
    ${trendStackTableHtml({
    title: l('informalContact'),
    rows: dashboard.trends ?? [],
    labelForRow: (row) => shortDate(row.date),
    distForRow: (row) => row.informalContactDist,
    segments: freqSegments,
    dir,
  })}
    ${horizontalBarsHtml({
    title: l('concerningTrends'),
    dist: dashboard.distributions?.concerningTrends,
    labelForKey: l,
    color: POOL_COLORS.purple,
    dir,
  })}
    ${horizontalBarsHtml({
    title: l('interventionNeeded'),
    dist: dashboard.distributions?.interventionNeeded,
    labelForKey: l,
    color: POOL_COLORS.teal,
    dir,
  })}
    ${legendHtml(interventionSegments)}
    ${commentsTableHtml({
    title: l('openResponses'),
    rows: dashboard.recentComments,
    columns: [
      { label: l('settlement'), value: (r) => r.settlement },
      { label: l('comment'), value: (r) => r.comment },
    ],
    dir,
    reverseColumns: true,
  })}
  `;

  return buildPoolShellHtml({
    title: labels.educationTitle,
    subtitle: dateRangeText(summary.dateRange),
    kpis,
    body,
    dir,
    href: link,
    ctaLabel: labels.openInApp,
  });
}

/**
 * @param {object} cached  Result of getCachedReport()
 * @returns {object | null}
 */
