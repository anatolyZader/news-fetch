/**
 * Builds and sends resilience / pools digest emails via IMailingDeliveryPort.
 */
import { getNaftaliDashboard } from '../../naftali/app/naftaliService.js';
import { getEducationDashboard } from '../../education/app/educationSessionsService.js';

const DEFAULT_MAX_MARKDOWN = 100_000;

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
 * @param {number} [opts.maxMarkdownChars]
 */
export function createMailingService({
  deliveryPort,
  mailFrom,
  getCachedReport,
  maxMarkdownChars = Number(process.env.MAIL_DIGEST_MAX_MARKDOWN_CHARS) || DEFAULT_MAX_MARKDOWN,
}) {
  if (!deliveryPort || !mailFrom) {
    throw new Error('mailingService requires deliveryPort and mailFrom');
  }

  /**
   * @param {{ report?: boolean, naftali?: boolean, education?: boolean, platform?: boolean }} products
   */
  async function buildDigestParts(products) {
    const partsText = [];
    const partsHtml = [];

    if (products.report) {
      const cached = getCachedReport();
      const assessment = getAssessmentFromCache(cached);
      const reportDate = cached?.reportDate ?? 'unknown date';
      if (cached?.markdown && String(cached.markdown).trim()) {
        const md = truncate(String(cached.markdown).trim(), maxMarkdownChars);
        partsText.push(`=== 8 components — daily resilience report (${reportDate}) ===\n\n${md}`);
        partsHtml.push(`<h2>8 components — daily resilience report (${escapeHtml(reportDate)})</h2><pre style="white-space:pre-wrap;font-family:system-ui,sans-serif;font-size:14px">${escapeHtml(md)}</pre>`);
      } else if (assessment) {
        const syn = String(assessment.cross_component_synthesis ?? '').trim();
        const lines = [`=== 8 components — daily resilience report (${reportDate}) ===`, '', syn || '(No executive summary.)', ''];
        const comps = assessment.components ?? [];
        for (const c of comps) {
          const id = c.component_id ?? '';
          const score = c.score != null ? String(c.score) : '—';
          const nar = truncate(String(c.narrative ?? ''), 4000);
          lines.push(`--- ${id} (score ${score}) ---`, nar, '');
        }
        const textBlock = lines.join('\n');
        partsText.push(textBlock);
        partsHtml.push(`<h2>8 components — daily resilience report (${escapeHtml(reportDate)})</h2><pre style="white-space:pre-wrap">${escapeHtml(textBlock)}</pre>`);
      } else {
        partsText.push('=== 8 components — daily resilience report ===\n(No report available for this run.)');
        partsHtml.push('<h2>8 components</h2><p><em>No report available for this run.</em></p>');
      }
    }

    if (products.naftali) {
      try {
        const dash = await getNaftaliDashboard({ forceRefresh: false });
        const json = truncate(JSON.stringify(dash, null, 2), 12_000);
        partsText.push(`=== Pools — Naftali ===\n\n${json}`);
        partsHtml.push(`<h2>Pools — Naftali</h2><pre style="white-space:pre-wrap">${escapeHtml(json)}</pre>`);
      } catch (e) {
        const msg = e?.message ?? 'failed to load';
        partsText.push(`=== Pools — Naftali ===\n(Error: ${msg})`);
        partsHtml.push(`<h2>Pools — Naftali</h2><p style="color:#b00">Error: ${escapeHtml(msg)}</p>`);
      }
    }

    if (products.education) {
      try {
        const dash = await getEducationDashboard({ forceRefresh: false });
        const json = truncate(JSON.stringify(dash, null, 2), 12_000);
        partsText.push(`=== Pools — Education ===\n\n${json}`);
        partsHtml.push(`<h2>Pools — Education</h2><pre style="white-space:pre-wrap">${escapeHtml(json)}</pre>`);
      } catch (e) {
        const msg = e?.message ?? 'failed to load';
        partsText.push(`=== Pools — Education ===\n(Error: ${msg})`);
        partsHtml.push(`<h2>Pools — Education</h2><p style="color:#b00">Error: ${escapeHtml(msg)}</p>`);
      }
    }

    if (products.platform) {
      const note = 'Product and operational notices: none configured for this digest. This section may include non-data announcements in the future.';
      partsText.push(`=== Platform notices ===\n\n${note}`);
      partsHtml.push(`<h2>Platform notices</h2><p>${escapeHtml(note)}</p>`);
    }

    return {
      text: partsText.join('\n\n'),
      html: `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;line-height:1.45">${partsHtml.join('<hr/>')}</body></html>`,
    };
  }

  return {
    buildDigestParts,

    /**
     * @param {{ to: string, products: { report: boolean, naftali: boolean, education: boolean, platform: boolean } }} args
     */
    async sendDigest({ to, products }) {
      const digest = await buildDigestParts(products);
      const date = getCachedReport()?.reportDate ?? new Date().toISOString().slice(0, 10);
      const subject = `Vibes Witch — digest — ${date}`;
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
