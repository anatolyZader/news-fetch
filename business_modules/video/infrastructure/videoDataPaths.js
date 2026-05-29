import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Default directory for yt-dlp downloads, subtitles, and retained audio (override with VIDEO_DOWNLOAD_DIR). */
export function defaultVideoDownloadDir() {
  return resolve(moduleRoot, 'data');
}
