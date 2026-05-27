/**
 * Strict validation for URLs passed to yt-dlp (reduces open redirects / obvious SSRF to internal hosts).
 * Note: yt-dlp still follows HTTP redirects; lock down egress in production if needed.
 */

const MAX_URL_LENGTH = 2048;

/** @param {string} hostname */
function isBlockedHostname(hostname) {
  const h = hostname.toLowerCase().replaceAll(/^\[|\]$/g, '');
  if (h === 'localhost' || h === '0') {
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

/** @param {string} host */
function isBlockedIpv4(host) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

/**
 * @param {unknown} raw
 * @returns {string} Normalized URL string for yt-dlp
 */
export function validateRemoteVideoUrl(raw) {
  if (typeof raw !== 'string') {
    throw new Error('url must be a string');
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

  return u.toString();
}
