import { lookup } from 'node:dns/promises';

/**
 * SSRF guard for user-supplied http(s) URLs.
 */

export const MAX_URL_LENGTH = 2048;

/** @param {string} hostname */
export function isBlockedHostname(hostname) {
  const h = hostname.toLowerCase().replaceAll(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '0' || h.endsWith('.localhost') || h.endsWith('.local')) {
    return true;
  }
  if (h.includes(':')) {
    if (h === '::1' || h.endsWith('::1')) return true;
    if (/^fe80:/i.test(h) || /^fec0:/i.test(h)) return true;
    if (/^fc[0-9a-f]{2}:/i.test(h) || /^fd[0-9a-f]{2}:/i.test(h)) return true;
    if (h.includes('::ffff:')) {
      const v4 = h.replace(/^.*::ffff:/i, '');
      return isBlockedIpv4(v4);
    }
    return false;
  }
  if (h.includes('::ffff:')) {
    const v4 = h.replace(/^.*::ffff:/i, '');
    return isBlockedIpv4(v4);
  }

  return isBlockedIpv4(h);
}

/** @param {number} a @param {number} b @param {number} c */
function isReservedIpv4(a, b, c) {
  return (
    a === 10
    || a === 127
    || a === 0
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 192 && b === 0 && (c === 0 || c === 2))
  );
}

/** @param {string} host */
export function isBlockedIpv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const octets = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (octets.some((n) => n > 255)) return true;
  return isReservedIpv4(octets[0], octets[1], octets[2]);
}

/**
 * @param {URL} u
 */
export function assertSafeHttpUrl(u) {
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('only http and https URLs are allowed');
  }
  if (u.username || u.password) {
    throw new Error('url must not contain credentials');
  }
  if (!u.hostname) {
    throw new Error('url must include a host');
  }
  if (isBlockedHostname(u.hostname)) {
    throw new Error('url host is not allowed');
  }
}

/**
 * @param {unknown} raw
 * @returns {string} Normalized URL string
 */
export function validateUserFetchUrl(raw) {
  if (typeof raw !== 'string') {
    throw new TypeError('url must be a string');
  }
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) {
    throw new Error('url is missing or too long');
  }

  let u;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error('url is not a valid URL');
  }

  assertSafeHttpUrl(u);
  return u.toString();
}

/**
 * Reject hostnames that resolve to private/link-local addresses (DNS rebinding mitigation).
 * @param {string} hostname
 */
export async function assertResolvedHostSafe(hostname) {
  const host = String(hostname ?? '').trim().replaceAll(/^\[|\]$/g, '');
  if (!host || isBlockedHostname(host)) {
    throw new Error('url host is not allowed');
  }
  if (isBlockedIpv4(host)) {
    throw new Error('url host is not allowed');
  }

  let records;
  try {
    records = await lookup(host, { all: true });
  } catch {
    throw new Error('url host could not be resolved');
  }

  for (const rec of records) {
    const addr = rec.address;
    if (rec.family === 4 || addr.includes('.')) {
      if (isBlockedIpv4(addr)) {
        throw new Error('url host resolves to a disallowed address');
      }
    } else if (isBlockedHostname(addr)) {
      throw new Error('url host resolves to a disallowed address');
    }
  }
}

/** @deprecated use validateUserFetchUrl */
export const validateRemoteVideoUrl = validateUserFetchUrl;
