import { createHmac, timingSafeEqual } from 'node:crypto';

const DEFAULT_TOLERANCE_SEC = 300;

/**
 * Verify a Svix-style webhook signature (used by Resend webhooks).
 *
 * Signed content is `${svix-id}.${svix-timestamp}.${rawBody}`, HMAC-SHA256 with the
 * base64-decoded secret (`whsec_` prefix stripped), base64-encoded, sent as one or
 * more space-delimited `v1,<base64>` entries in the `svix-signature` header.
 *
 * @param {string | Buffer} rawBody  Exact request payload bytes
 * @param {Record<string, string | string[] | undefined>} headers  Request headers (lowercased keys)
 * @param {string} secret  Endpoint secret, with or without `whsec_` prefix
 * @param {{ toleranceSec?: number, nowSec?: number }} [opts]
 * @returns {{ ok: boolean, reason?: string }}
 */
export function verifySvixSignature(rawBody, headers, secret, opts = {}) {
  if (!secret?.trim()) {
    return { ok: false, reason: 'missing_secret' };
  }
  const id = headerValue(headers, 'svix-id');
  const timestamp = headerValue(headers, 'svix-timestamp');
  const signatureHeader = headerValue(headers, 'svix-signature');
  if (!id || !timestamp || !signatureHeader) {
    return { ok: false, reason: 'missing_signature_headers' };
  }

  const toleranceSec = opts.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const timestampSec = Number(timestamp);
  if (!Number.isFinite(timestampSec) || Math.abs(nowSec - timestampSec) > toleranceSec) {
    return { ok: false, reason: 'timestamp_out_of_tolerance' };
  }

  let key;
  try {
    key = Buffer.from(secret.trim().replace(/^whsec_/, ''), 'base64');
  } catch {
    return { ok: false, reason: 'invalid_secret' };
  }
  if (!key.length) {
    return { ok: false, reason: 'invalid_secret' };
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''), 'utf8');
  const signedContent = Buffer.concat([Buffer.from(`${id}.${timestamp}.`, 'utf8'), body]);
  const expected = createHmac('sha256', key).update(signedContent).digest();

  for (const entry of signatureHeader.split(' ')) {
    const [version, sig] = entry.split(',');
    if (version !== 'v1' || !sig) continue;
    let candidate;
    try {
      candidate = Buffer.from(sig, 'base64');
    } catch {
      continue;
    }
    if (candidate.length === expected.length && timingSafeEqual(candidate, expected)) {
      return { ok: true };
    }
  }
  return { ok: false, reason: 'signature_mismatch' };
}

/**
 * @param {Record<string, string | string[] | undefined>} headers
 * @param {string} name
 * @returns {string}
 */
function headerValue(headers, name) {
  const raw = headers?.[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return typeof value === 'string' ? value.trim() : '';
}
