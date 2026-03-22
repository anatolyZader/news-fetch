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
    return id && /^[\w-]{11}$/.test(id) ? id : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = u.searchParams.get('v');
    if (v && /^[\w-]{11}$/.test(v)) return v;
    const embed = u.pathname.match(/^\/embed\/([\w-]{11})/);
    if (embed) return embed[1];
    const shorts = u.pathname.match(/^\/shorts\/([\w-]{11})/);
    if (shorts) return shorts[1];
    const live = u.pathname.match(/^\/live\/([\w-]{11})/);
    if (live) return live[1];
  }
  return null;
}
