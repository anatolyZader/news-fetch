/**
 * Builds and sends resilience / pools digest emails via IMailingDeliveryPort.
 */
import { existsSync, readFileSync, readdirSync } from 'fs';
import { resolve } from 'path';
import { getNaftaliDashboard } from '../../naftali/app/naftaliService.js';
import { getEducationDashboard } from '../../education/app/educationSessionsService.js';
import { getMunicipalityDashboard } from '../../pbo_report_muni/app/pboMunicipalityService.js';

const DEFAULT_MAX_MARKDOWN = 100_000;
const LABELS = {
  en: {
    reportTitle: '8 components — daily resilience report',
    naftaliTitle: 'Pools — Naftali',
    educationTitle: 'Pools — Education',
    platformTitle: 'Platform notices',
    noReport: 'No report available for this run.',
    noSummary: 'No executive summary.',
    score: 'score',
    metadata: 'Metadata',
    reportDate: 'Report date',
    generatedAt: 'Generated at',
    totalArticles: 'Articles analyzed',
    pboReports: 'PBO reports',
    dataByDay: 'Data included by day',
    date: 'Date',
    articles: 'Articles',
    overallScore: 'Overall score',
    components: 'Components',
    executiveSummary: 'Executive summary',
    componentNarratives: 'Component narratives',
    subject: 'Vibes Witch — digest',
  },
  he: {
    reportTitle: '8 מרכיבים — דוח חוסן יומי',
    naftaliTitle: 'בריכות — נפתלי',
    educationTitle: 'בריכות — חינוך',
    platformTitle: 'הודעות מערכת',
    noReport: 'אין דוח זמין להרצה זו.',
    noSummary: 'אין סיכום מנהלים.',
    score: 'ציון',
    metadata: 'מטא־דאטה',
    reportDate: 'תאריך הדוח',
    generatedAt: 'נוצר בתאריך',
    totalArticles: 'כתבות שנותחו',
    pboReports: 'דוחות קב"ט',
    dataByDay: 'נתונים שנכללו לפי יום',
    date: 'תאריך',
    articles: 'כתבות',
    overallScore: 'ציון כולל',
    components: 'מרכיבים',
    executiveSummary: 'סיכום מנהלים',
    componentNarratives: 'נרטיבים לפי מרכיב',
    subject: 'Vibes Witch — דיוור יומי',
  },
  ru: {
    reportTitle: '8 компонентов — ежедневный отчёт устойчивости',
    naftaliTitle: 'Пулы — Нафтали',
    educationTitle: 'Пулы — Образование',
    platformTitle: 'Сообщения системы',
    noReport: 'Отчёт недоступен для этой отправки.',
    noSummary: 'Нет краткого резюме.',
    score: 'оценка',
    metadata: 'Метаданные',
    reportDate: 'Дата отчёта',
    generatedAt: 'Создано',
    totalArticles: 'Статей проанализировано',
    pboReports: 'Отчёты ПБО',
    dataByDay: 'Данные по дням',
    date: 'Дата',
    articles: 'Статьи',
    overallScore: 'Общая оценка',
    components: 'Компоненты',
    executiveSummary: 'Краткое резюме',
    componentNarratives: 'Текстовые выводы по компонентам',
    subject: 'Vibes Witch — дайджест',
  },
};

const COMPONENT_LABELS = {
  en: {
    narrative: 'Narrative',
    information_communication: 'Information and communication',
    lifesaving_behavior: 'Lifesaving behavior',
    functional_continuity: 'Functional continuity',
    community_capital: 'Community capital',
    leadership: 'Leadership',
    belonging_solidarity: 'Belonging and solidarity',
    wellbeing_atrisk: 'Wellbeing and at-risk groups',
  },
  he: {
    narrative: 'נרטיב',
    information_communication: 'מידע ותקשורת',
    lifesaving_behavior: 'התנהגות מצילת חיים',
    functional_continuity: 'רציפות תפקודית',
    community_capital: 'הון קהילתי',
    leadership: 'מנהיגות',
    belonging_solidarity: 'שייכות וסולידריות',
    wellbeing_atrisk: 'רווחה וקבוצות בסיכון',
  },
  ru: {
    narrative: 'Нарратив',
    information_communication: 'Информация и коммуникация',
    lifesaving_behavior: 'Поведение, спасающее жизнь',
    functional_continuity: 'Функциональная непрерывность',
    community_capital: 'Общественный капитал',
    leadership: 'Лидерство',
    belonging_solidarity: 'Принадлежность и солидарность',
    wellbeing_atrisk: 'Благополучие и группы риска',
  },
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

function scoreBadgeColor(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return { bg: '#eef2f7', fg: '#334155', border: '#d8dee8' };
  if (n <= 3) return { bg: '#fee2e2', fg: '#991b1b', border: '#fecaca' };
  if (n <= 6) return { bg: '#fef3c7', fg: '#92400e', border: '#fde68a' };
  return { bg: '#dcfce7', fg: '#166534', border: '#bbf7d0' };
}

function paragraphHtml(text) {
  const chunks = String(text ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (chunks.length === 0) return '<p style="margin:0;color:#64748b"><em>—</em></p>';
  return chunks
    .map((p) => `<p style="margin:0 0 12px 0">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function componentLabel(componentId, lang) {
  return COMPONENT_LABELS[lang]?.[componentId]
    ?? COMPONENT_LABELS.en[componentId]
    ?? String(componentId ?? '').replace(/_/g, ' ');
}

function extractSourceFileDates(sourceFiles = []) {
  return [...new Set(
    sourceFiles
      .map((f) => /(\d{4}-\d{2}-\d{2})/.exec(String(f))?.[1])
      .filter(Boolean),
  )].sort();
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
  const signalsDir = resolve(import.meta.dirname, '../../../signals');
  const wantedFiles = new Set(sourceFiles.map((f) => String(f)));
  const totals = new Map();
  if (!existsSync(signalsDir) || wantedFiles.size === 0) return totals;

  try {
    for (const file of readdirSync(signalsDir)) {
      const match = new RegExp(`^signals-${sourceType}-(\\d{4}-\\d{2}-\\d{2})\\.json$`).exec(file);
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
  ].filter(Boolean))].sort();

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

  dates = [...new Set([...dates, ...pboCounts.keys()])].sort();

  return dates.map((date) => ({
    date,
    articles: articleCounts.get(date) ?? 0,
    pboReports: pboCounts.get(date) ?? 0,
  }));
}

function buildReportText({ cached, assessment, labels, lang }) {
  const reportDate = cached?.reportDate ?? assessment?.date ?? 'unknown date';
  const generatedAt = cached?.generated_at ?? cached?.generatedAt ?? '';
  const totalArticles = assessment?.total_articles_analyzed ?? cached?.total_articles_analyzed ?? '';
  const dayBreakdown = buildDayBreakdown(cached, assessment);
  const totalPboReports = dayBreakdown.reduce((sum, d) => sum + (Number(d.pboReports) || 0), 0);
  const overall = assessment?.overall_resilience_score ?? '';
  const comps = Array.isArray(assessment?.components) ? assessment.components : [];
  const lines = [
    `=== ${labels.reportTitle} (${reportDate}) ===`,
    '',
    `${labels.metadata}:`,
    `- ${labels.reportDate}: ${displayValue(reportDate)}`,
    `- ${labels.generatedAt}: ${displayValue(generatedAt)}`,
    `- ${labels.totalArticles}: ${displayValue(totalArticles)}`,
    `- ${labels.pboReports}: ${displayValue(totalPboReports)}`,
    `- ${labels.overallScore}: ${displayValue(overall)}`,
    `- ${labels.components}: ${comps.length}`,
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
    lines.push(
      '',
      `--- ${componentLabel(c.component_id, lang)} (${labels.score} ${displayValue(c.score)}) ---`,
      truncate(String(c.narrative ?? ''), 6000),
    );
  }
  return lines.join('\n');
}

function buildReportHtml({ cached, assessment, labels, lang, dir }) {
  const reportDate = cached?.reportDate ?? assessment?.date ?? 'unknown date';
  const generatedAt = cached?.generated_at ?? cached?.generatedAt ?? '';
  const totalArticles = assessment?.total_articles_analyzed ?? cached?.total_articles_analyzed ?? '';
  const dayBreakdown = buildDayBreakdown(cached, assessment);
  const totalPboReports = dayBreakdown.reduce((sum, d) => sum + (Number(d.pboReports) || 0), 0);
  const overall = assessment?.overall_resilience_score ?? '';
  const comps = Array.isArray(assessment?.components) ? assessment.components : [];
  const overallColors = scoreBadgeColor(overall);
  const metaRows = [
    [labels.reportDate, reportDate],
    [labels.generatedAt, generatedAt],
    [labels.totalArticles, totalArticles],
    [labels.pboReports, totalPboReports],
    [labels.overallScore, overall],
    [labels.components, comps.length],
  ];

  const componentCards = comps.map((c) => {
    const colors = scoreBadgeColor(c.score);
    return `
      <section style="margin:0 0 16px 0;padding:18px 20px;border:1px solid #e2e8f0;border-radius:16px;background:#ffffff">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
          <h3 style="margin:0;font-size:18px;line-height:1.3;color:#0f172a">${escapeHtml(componentLabel(c.component_id, lang))}</h3>
          <span style="display:inline-block;white-space:nowrap;border:1px solid ${colors.border};background:${colors.bg};color:${colors.fg};border-radius:999px;padding:5px 10px;font-size:13px;font-weight:700">
            ${escapeHtml(labels.score)} ${escapeHtml(displayValue(c.score))}
          </span>
        </div>
        <div style="font-size:15px;line-height:1.65;color:#1e293b">${paragraphHtml(truncate(String(c.narrative ?? ''), 6000))}</div>
      </section>
    `;
  }).join('');

  return `
    <div style="margin:0 auto;max-width:760px;background:#f8fafc;padding:28px 18px" dir="${dir}">
      <div style="background:#ffffff;border:1px solid #e2e8f0;border-radius:22px;overflow:hidden;box-shadow:0 12px 34px rgba(15,23,42,0.08)">
        <header style="padding:28px 30px;background:linear-gradient(135deg,#0f172a,#1e3a8a);color:#ffffff">
          <div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;opacity:.78;margin-bottom:8px">Vibes Witch</div>
          <h1 style="margin:0;font-size:28px;line-height:1.2">${escapeHtml(labels.reportTitle)}</h1>
          <div style="margin-top:14px;display:inline-block;border:1px solid rgba(255,255,255,.38);border-radius:999px;padding:6px 12px;font-size:14px">
            ${escapeHtml(labels.reportDate)}: ${escapeHtml(displayValue(reportDate))}
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
                      ${k === labels.overallScore
    ? `<span style="display:inline-block;border:1px solid ${overallColors.border};background:${overallColors.bg};color:${overallColors.fg};border-radius:999px;padding:5px 10px;font-weight:800">${escapeHtml(displayValue(v))}</span>`
    : escapeHtml(displayValue(v))}
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

/**
 * @param {object} cached  Result of getCachedReport()
 * @returns {object | null}
 */
function getAssessmentFromCache(cached) {
  if (!cached) return null;
  if (cached.assessment && typeof cached.assessment === 'object') return cached.assessment;
  if (Array.isArray(cached.components)) return cached;
  return null;
}

/**
 * @param {object} opts
 * @param {import('../domain/ports/IMailingDeliveryPort.js').IMailingDeliveryPort} opts.deliveryPort
 * @param {string} opts.mailFrom
 * @param {() => any} opts.getCachedReport
 * @param {(report: object, lang: string) => Promise<object>} [opts.translateReport]
 * @param {number} [opts.maxMarkdownChars]
 */
export function createMailingService({
  deliveryPort,
  mailFrom,
  getCachedReport,
  translateReport,
  maxMarkdownChars = Number(process.env.MAIL_DIGEST_MAX_MARKDOWN_CHARS) || DEFAULT_MAX_MARKDOWN,
}) {
  if (!deliveryPort || !mailFrom) {
    throw new Error('mailingService requires deliveryPort and mailFrom');
  }

  /**
   * @param {{ report?: boolean, naftali?: boolean, education?: boolean, platform?: boolean }} products
   * @param {string} [language]
   */
  async function buildDigestParts(products, language = 'en') {
    const lang = normalizeLanguage(language);
    const labels = LABELS[lang] ?? LABELS.en;
    const dir = lang === 'he' ? 'rtl' : 'ltr';
    const partsText = [];
    const partsHtml = [];

    if (products.report) {
      const cached = getCachedReport();
      let assessment = getAssessmentFromCache(cached);
      const reportDate = cached?.reportDate ?? 'unknown date';
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
      } else {
        partsText.push(`=== ${labels.reportTitle} ===\n(${labels.noReport})`);
        partsHtml.push(`<h2>${escapeHtml(labels.reportTitle)}</h2><p><em>${escapeHtml(labels.noReport)}</em></p>`);
      }
    }

    if (products.naftali) {
      try {
        const dash = await getNaftaliDashboard({ forceRefresh: false });
        const json = truncate(JSON.stringify(dash, null, 2), 12_000);
        partsText.push(`=== ${labels.naftaliTitle} ===\n\n${json}`);
        partsHtml.push(`<h2>${escapeHtml(labels.naftaliTitle)}</h2><pre style="white-space:pre-wrap">${escapeHtml(json)}</pre>`);
      } catch (e) {
        const msg = e?.message ?? 'failed to load';
        partsText.push(`=== ${labels.naftaliTitle} ===\n(Error: ${msg})`);
        partsHtml.push(`<h2>${escapeHtml(labels.naftaliTitle)}</h2><p style="color:#b00">Error: ${escapeHtml(msg)}</p>`);
      }
    }

    if (products.education) {
      try {
        const dash = await getEducationDashboard({ forceRefresh: false });
        const json = truncate(JSON.stringify(dash, null, 2), 12_000);
        partsText.push(`=== ${labels.educationTitle} ===\n\n${json}`);
        partsHtml.push(`<h2>${escapeHtml(labels.educationTitle)}</h2><pre style="white-space:pre-wrap">${escapeHtml(json)}</pre>`);
      } catch (e) {
        const msg = e?.message ?? 'failed to load';
        partsText.push(`=== ${labels.educationTitle} ===\n(Error: ${msg})`);
        partsHtml.push(`<h2>${escapeHtml(labels.educationTitle)}</h2><p style="color:#b00">Error: ${escapeHtml(msg)}</p>`);
      }
    }

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

  return {
    buildDigestParts,

    /**
     * @param {{ to: string, products: { report: boolean, naftali: boolean, education: boolean, platform: boolean }, language?: string }} args
     */
    async sendDigest({ to, products, language = 'en' }) {
      const lang = normalizeLanguage(language);
      const labels = LABELS[lang] ?? LABELS.en;
      const digest = await buildDigestParts(products, lang);
      const date = getCachedReport()?.reportDate ?? new Date().toISOString().slice(0, 10);
      const subject = `${labels.subject} — ${date}`;
      return deliveryPort.sendTransactional({
        from: mailFrom,
        to: String(to).trim(),
        subject,
        text: digest.text,
        html: digest.html,
      });
    },
  };
}

function normalizeLanguage(lang) {
  const v = String(lang ?? 'en').trim().toLowerCase();
  return ['en', 'he', 'ru'].includes(v) ? v : 'en';
}
