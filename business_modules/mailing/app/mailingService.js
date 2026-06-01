/**
 * Builds and sends resilience / pools digest emails via IMailingDeliveryPort.
 */
import { createDefaultPoolService } from '../../pool/index.js';
import { LABELS } from '../domain/copy/mailingLabels.js';
import { buildDigestParts, normalizeLanguage } from './digestAssembler.js';

const DEFAULT_MAX_MARKDOWN = 100_000;

/**
 * @param {object} opts
 * @param {import('../domain/ports/IMailingDeliveryPort.js').IMailingDeliveryPort} opts.deliveryPort
 * @param {string} opts.mailFrom
 * @param {() => any} opts.getCachedReport
 * @param {(report: object, lang: string) => Promise<object>} [opts.translateReport]
 * @param {number} [opts.maxMarkdownChars]
 * @param {{ getNaftaliDashboard: (opts?: { forceRefresh?: boolean }) => Promise<unknown>, getEducationDashboard: (opts?: { forceRefresh?: boolean }) => Promise<unknown> }} [opts.poolService]
 */
export function createMailingService({
  deliveryPort,
  mailFrom,
  getCachedReport,
  translateReport,
  maxMarkdownChars: _maxMarkdownChars = Number(process.env.MAIL_DIGEST_MAX_MARKDOWN_CHARS) || DEFAULT_MAX_MARKDOWN,
  poolService: poolServiceArg,
}) {
  if (!deliveryPort || !mailFrom) {
    throw new Error('mailingService requires deliveryPort and mailFrom');
  }

  const poolService = poolServiceArg ?? createDefaultPoolService();
  const assemblerOpts = { getCachedReport, translateReport, poolService };

  /**
   * @param {{ report?: boolean, naftali?: boolean, education?: boolean, platform?: boolean }} products
   * @param {string} [language]
   */
  async function buildDigestPartsForService(products, language = 'en') {
    return buildDigestParts(assemblerOpts, products, language);
  }

  return {
    buildDigestParts: buildDigestPartsForService,

    /**
     * @param {{ to: string, products: { report: boolean, naftali: boolean, education: boolean, platform: boolean }, language?: string }} args
     */
    async sendDigest({ to, products, language = 'en' }) {
      const lang = normalizeLanguage(language);
      const labels = LABELS[lang] ?? LABELS.en;
      const digest = await buildDigestPartsForService(products, lang);
      const date = getCachedReport()?.reportDate ?? new Date().toISOString().slice(0, 10);
      const sentAt = new Date();
      const sendTime = sentAt.toISOString().slice(11, 16);
      const subject = `${labels.subject} — ${date} — ${sendTime} UTC`;
      return deliveryPort.sendTransactional({
        from: mailFrom,
        to: String(to).trim(),
        subject,
        text: digest.text,
        html: digest.html,
        headers: {
          'X-Entity-Ref-ID': `vibeswitch-digest-${date}-${sentAt.getTime()}`,
        },
      });
    },
  };
}
