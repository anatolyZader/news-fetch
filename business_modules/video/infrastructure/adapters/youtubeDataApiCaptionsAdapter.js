/**
 * YouTube Data API v3 captions (Google APIs client). Requires OAuth2 refresh token — captions
 * cannot be downloaded with an API key alone.
 *
 * Env (any one naming scheme):
 *   YOUTUBE_OAUTH_CLIENT_ID + YOUTUBE_OAUTH_CLIENT_SECRET + YOUTUBE_OAUTH_REFRESH_TOKEN
 *   or GOOGLE_OAUTH_CLIENT_ID + GOOGLE_OAUTH_CLIENT_SECRET + GOOGLE_OAUTH_REFRESH_TOKEN
 */

import { google } from 'googleapis';

/**
 * @returns {import('googleapis').Auth.OAuth2Client | null}
 */
function createOAuth2ClientIfConfigured() {
  const clientId =
    process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim() || process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret =
    process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim() || process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const refreshToken =
    process.env.YOUTUBE_OAUTH_REFRESH_TOKEN?.trim() || process.env.GOOGLE_OAUTH_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    return null;
  }

  const client = new google.auth.OAuth2(clientId, clientSecret);
  client.setCredentials({ refresh_token: refreshToken });
  return client;
}

/**
 * @param {object} [deps]
 * @param {import('googleapis').Auth.OAuth2Client | null} [deps.oauth2Client]
 */
export function createYoutubeDataApiCaptionsAdapter(deps = {}) {
  const oauth2Client = deps.oauth2Client ?? createOAuth2ClientIfConfigured();

  return {
    isConfigured: () => !!oauth2Client,

    /**
     * @param {{ videoId: string, preferLangPrefixes?: string[] }} opts
     * @returns {Promise<string | null>} VTT body or null if no track / error
     */
    async downloadBestVtt(opts) {
      const { videoId, preferLangPrefixes = ['he', 'iw', 'en'] } = opts;
      if (!oauth2Client) return null;

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      const list = await youtube.captions.list({
        part: 'snippet',
        videoId,
      });

      const items = list.data.items ?? [];
      if (items.length === 0) return null;

      const sorted = [...items].sort((a, b) => {
        const la = (a.snippet?.language ?? '').toLowerCase();
        const lb = (b.snippet?.language ?? '').toLowerCase();
        const ra = preferLangPrefixes.findIndex((p) => la === p || la.startsWith(`${p}-`));
        const rb = preferLangPrefixes.findIndex((p) => lb === p || lb.startsWith(`${p}-`));
        const va = ra === -1 ? 999 : ra;
        const vb = rb === -1 ? 999 : rb;
        return va - vb;
      });

      const captionId = sorted[0]?.id;
      if (!captionId) return null;

      const res = await youtube.captions.download(
        {
          id: captionId,
          tfmt: 'vtt',
        },
        { responseType: 'text' },
      );

      const data = res.data;
      if (typeof data === 'string') return data;
      if (data instanceof Buffer) return data.toString('utf8');
      return String(data ?? '');
    },
  };
}
