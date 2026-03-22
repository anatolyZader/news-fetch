import { validateRemoteVideoUrl } from '../domain/services/remoteVideoUrlValidation.js';
import { extractYoutubeVideoId } from '../domain/services/youtubeVideoId.js';
import { parseWebVttToSegments } from '../domain/services/parseWebVtt.js';

/**
 * @typedef {'yt-dlp' | 'youtube-data-api' | 'none'} TranscriptSourceKind
 */

/**
 * Resolves YouTube captions into diarized-shaped segments (speaker CAPTION) when available.
 */
export class YoutubeTranscriptService {
  /**
   * @param {object} deps
   * @param {{ downloadSubtitleVttFiles?: (o: { url: string, outputDir: string }) => Promise<object> }} deps.remoteFetchPort
   * @param {{ isConfigured?: () => boolean, downloadBestVtt?: (o: { videoId: string }) => Promise<string | null> }} [deps.dataApiCaptions]
   */
  constructor(deps) {
    if (!deps?.remoteFetchPort?.downloadSubtitleVttFiles) {
      throw new Error('YoutubeTranscriptService requires remoteFetchPort.downloadSubtitleVttFiles');
    }
    this.remoteFetchPort = deps.remoteFetchPort;
    this.dataApiCaptions = deps.dataApiCaptions ?? null;
  }

  /**
   * @param {{ url: string, outputDir: string }} opts
   * @returns {Promise<{ segments: Array<{ speaker: string, text: string, start?: number, end?: number }>, source: TranscriptSourceKind, ytDlpError?: string, dataApiError?: string }>}
   */
  async fetchTranscriptSegments(opts) {
    const { url, outputDir } = opts;
    const safeUrl = validateRemoteVideoUrl(url);
    const videoId = extractYoutubeVideoId(safeUrl);

    const yt = await this.remoteFetchPort.downloadSubtitleVttFiles({
      url: safeUrl,
      outputDir,
    });

    if (yt.ok && yt.vttText && String(yt.vttText).trim()) {
      const segments = parseWebVttToSegments(yt.vttText);
      if (segments.length > 0) {
        return { segments, source: 'yt-dlp' };
      }
    }

    const ytDlpError = yt.ok ? undefined : (yt.error ?? 'yt-dlp subtitles failed');

    if (this.dataApiCaptions?.isConfigured?.() && videoId) {
      try {
        const vtt = await this.dataApiCaptions.downloadBestVtt({ videoId });
        if (vtt && vtt.trim()) {
          const segments = parseWebVttToSegments(vtt);
          if (segments.length > 0) {
            return { segments, source: 'youtube-data-api' };
          }
        }
      } catch (err) {
        return {
          segments: [],
          source: 'none',
          ytDlpError,
          dataApiError: err?.message ?? String(err),
        };
      }
    }

    return { segments: [], source: 'none', ytDlpError };
  }
}
