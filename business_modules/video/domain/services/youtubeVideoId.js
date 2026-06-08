const YOUTUBE_ID_RE = /^[\w-]{11}$/;

function isValidYoutubeId(id) {
  return id && YOUTUBE_ID_RE.test(id) ? id : null;
}

function extractFromYoutubeCom(u) {
  const v = u.searchParams.get('v');
  if (v && YOUTUBE_ID_RE.test(v)) return v;
  const pathPatterns = [/^\/embed\/([\w-]{11})/, /^\/shorts\/([\w-]{11})/, /^\/live\/([\w-]{11})/];
  for (const pattern of pathPatterns) {
    const match = u.pathname.match(pattern);
    if (match) return match[1];
  }
  return null;
}

/**
 * Extract YouTube video id from common watch / embed / shorts URLs.
 * @param {string} rawUrl
 * @returns {string|null}
 */
export function extractYoutubeVideoId(rawUrl) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim()) return null;
  let u;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (host === 'youtu.be') {
    const id = u.pathname.replace(/^\//, '').split('/')[0];
    return isValidYoutubeId(id);
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    return extractFromYoutubeCom(u);
  }
  return null;
}
