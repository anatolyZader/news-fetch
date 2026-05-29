/**
 * Parse inbound email replies for PBO review follow-ups.
 */

const QUOTED_REPLY_RE = /^(\s*(>|On .+ wrote:|ב-.+ כתב\/ה:|-----Original Message-----))/m;

/**
 * @param {string} address  e.g. pbo-review+abc123@inbound.example.com
 * @returns {string|null}
 */
export function extractReviewTokenFromAddress(address) {
  const raw = String(address ?? '').trim().toLowerCase();
  const match = /pbo-review\+([a-z0-9_-]+)@/.exec(raw);
  return match?.[1] ?? null;
}

/**
 * Strip common quoted-reply tails from plain text.
 * @param {string} text
 * @returns {string}
 */
export function stripQuotedReply(text) {
  const raw = String(text ?? '');
  const idx = raw.search(QUOTED_REPLY_RE);
  const body = idx >= 0 ? raw.slice(0, idx) : raw;
  return body.trim();
}

/**
 * @param {object} payload  Resend-like inbound webhook body
 * @returns {{ reviewToken: string|null, from: string, subject: string, text: string, to: string[] }}
 */
export function parseInboundEmailPayload(payload) {
  const data = payload?.data ?? payload ?? {};
  const toList = Array.isArray(data.to) ? data.to : [data.to].filter(Boolean);
  let reviewToken = null;
  for (const addr of toList) {
    reviewToken = extractReviewTokenFromAddress(addr);
    if (reviewToken) break;
  }
  if (!reviewToken && data.headers) {
    const hdr = data.headers['x-pbo-review-token'] ?? data.headers['X-Pbo-Review-Token'];
    if (hdr) reviewToken = String(hdr).trim();
  }
  const text = stripQuotedReply(data.text ?? data.html ?? '');
  return {
    reviewToken,
    from: String(data.from ?? '').trim(),
    subject: String(data.subject ?? '').trim(),
    text,
    to: toList.map(String),
  };
}
