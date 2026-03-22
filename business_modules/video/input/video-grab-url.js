#!/usr/bin/env node
/**
 * Download audio from a remote URL (e.g. YouTube) as MP3 via yt-dlp.
 *
 * Usage:
 *   node business_modules/video/input/video-grab-url.js --url <https://...> [--out-dir <dir>]
 */
import 'dotenv/config';
import { resolve } from 'node:path';

import { createYtDlpYoutubeAdapter } from '../infrastructure/adapters/ytDlpYoutubeAdapter.js';
import { createLocalVideoFileAdapter } from '../infrastructure/adapters/localVideoFileAdapter.js';
import { VideoGrabService } from '../app/videoGrabService.js';

const args = process.argv.slice(2);
const getArg = (flag, def = null) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] ?? def : def;
};

const url = getArg('--url');
const outDir = resolve(getArg('--out-dir', resolve('downloads', 'video')));

if (!url) {
  console.error('Usage: node business_modules/video/input/video-grab-url.js --url <https://...> [--out-dir <dir>]');
  process.exit(1);
}

const service = new VideoGrabService({
  remoteFetchPort: createYtDlpYoutubeAdapter(),
  localFilePort: createLocalVideoFileAdapter(),
});

const result = await service.downloadFromUrl(url, outDir);

if (!result.ok) {
  console.error('yt-dlp failed:', result.error);
  if (result.stderr) console.error(result.stderr);
  process.exit(1);
}

console.error(`Saved: ${result.outputPath}`);
process.exit(0);
