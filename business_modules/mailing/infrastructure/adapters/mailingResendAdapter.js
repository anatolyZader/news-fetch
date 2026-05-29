/**
 * Resend REST API adapter (https://resend.com/docs/api-reference/emails/send-email).
 * Uses global fetch — no extra npm dependency.
 */

const RESEND_URL = 'https://api.resend.com/emails';

/**
 * @param {{ apiKey: string, fetchImpl?: typeof fetch }} opts
 * @returns {import('../../domain/ports/IMailingDeliveryPort.js').IMailingDeliveryPort}
 */
export function createMailingResendAdapter({ apiKey, fetchImpl = fetch }) {
  const key = String(apiKey ?? '').trim();
  if (!key) {
    throw new Error('Resend apiKey is required');
  }

  return {
    async sendTransactional({ from, to, subject, text, html, headers, replyTo }) {
      const body = {
        from: String(from),
        to: [String(to)],
        subject: String(subject),
        text: String(text),
      };
      if (html && String(html).trim()) {
        body.html = String(html);
      }
      if (replyTo && String(replyTo).trim()) {
        body.reply_to = String(replyTo).trim();
      }
      if (headers && typeof headers === 'object') {
        body.headers = headers;
      }

      const res = await fetchImpl(RESEND_URL, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const raw = await res.text();
      let parsed;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = { raw };
      }

      if (!res.ok) {
        const msg = (parsed?.message ?? parsed?.error ?? raw) || `HTTP ${res.status}`;
        const err = new Error(`Resend error (${res.status}): ${msg}`);
        err.status = res.status;
        err.details = parsed;
        throw err;
      }

      return { id: parsed?.id ?? undefined };
    },
  };
}
