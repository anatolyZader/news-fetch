import { createWriteStream, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { safeFetch } from '../../../../cross-cut-modules/security/infrastructure/safeFetch.js';

const AUDIO_EXTENSIONS = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.opus', '.webm', '.mp4']);

function extensionFromUrl(url) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const idx = pathname.lastIndexOf('.');
    if (idx < 0) return '';
    return pathname.slice(idx);
  } catch {
    return '';
  }
}

function waitForFinish(stream) {
  return new Promise((resolve, reject) => {
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
}

export function createHttpAudioDownloadAdapter() {
  return {
    /**
     * Download a direct audio URL into a temp file and return its path.
     * @param {{ url: string }} p
     * @returns {Promise<{ filePath: string, contentType: string | null }>}
     */
    async downloadToTempFile({ url }) {
      const response = await safeFetch(url);
      if (!response.ok) {
        throw new Error(`Audio download failed (${response.status})`);
      }
      if (!response.body) {
        throw new Error('Audio download returned an empty body');
      }

      const contentType = response.headers.get('content-type');
      const ext = extensionFromUrl(url);
      const isAudioByType = typeof contentType === 'string' && contentType.toLowerCase().startsWith('audio/');
      const isAudioByExt = AUDIO_EXTENSIONS.has(ext);
      if (!isAudioByType && !isAudioByExt) {
        throw new Error(`URL is not recognized as audio (content-type: ${contentType ?? 'unknown'})`);
      }

      const dir = mkdtempSync(join(tmpdir(), 'audio-url-'));
      const out = join(dir, `download${isAudioByExt ? ext : '.mp3'}`);

      const writeStream = createWriteStream(out);
      Readable.fromWeb(response.body).pipe(writeStream);
      await waitForFinish(writeStream);
      return { filePath: out, contentType };
    },
  };
}
