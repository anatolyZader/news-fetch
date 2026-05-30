import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Verify Meta WhatsApp webhook X-Hub-Signature-256 header.
 * @param {string} rawBody
 * @param {string | undefined} signatureHeader
 * @param {string} appSecret
 */
export function verifyWhatsAppWebhookSignature(rawBody, signatureHeader, appSecret) {
  if (!appSecret?.trim()) {
    return { ok: false, reason: 'missing_app_secret' };
  }
  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { ok: false, reason: 'missing_signature' };
  }
  const expected = `sha256=${createHmac('sha256', appSecret.trim()).update(rawBody).digest('hex')}`;
  try {
    const a = Buffer.from(signatureHeader.trim());
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, reason: 'signature_mismatch' };
    }
    return { ok: true };
  } catch {
    return { ok: false, reason: 'signature_invalid' };
  }
}
