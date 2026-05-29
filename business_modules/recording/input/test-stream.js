#!/usr/bin/env node
/**
 * Step 2 of MVP: verify a stream URL works end-to-end before scheduling it.
 *
 * Records a stream for N seconds, writes to business_modules/recording/data/test/ and prints
 * the output path.  No DB, no transcription — pure "does FFmpeg capture this?".
 *
 * Usage:
 *   node business_modules/recording/input/test-stream.js \
 *     --url <stream-url> \
 *     [--duration 30] \
 *     [--out /tmp/test-recording.mp3]
 *
 * HOW TO FIND STREAM URLS:
 *   1. Open the station's website in Chrome/Firefox.
 *   2. Open DevTools → Network tab.
 *   3. Filter by:  .m3u8  or  .mp3  or  stream  or  live
 *   4. Press play on the site and watch for new requests.
 *   5. Copy the request URL — that is your stream URL.
 *
 *   Common patterns:
 *     HLS (most Israeli public radio):  https://...  /playlist.m3u8
 *     Shoutcast/Icecast (commercial):   http://...   /stream  or  /live
 */

import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { createFfmpegDirectStreamAdapter } from '../infrastructure/adapters/ffmpegDirectStreamAdapter.js';
import { defaultRecordingsDir } from '../infrastructure/recordingDataPaths.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const getArg = (flag, def = null) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? (args[idx + 1] ?? def) : def;
};

const streamUrl  = getArg('--url');
const durationSec = Number.parseInt(getArg('--duration', '30'), 10);
const defaultOut = join(defaultRecordingsDir(), 'test', `test-${Date.now()}.mp3`);
const outputPath = resolve(getArg('--out', defaultOut));

if (!streamUrl) {
  console.error('Usage: node test-stream.js --url <stream-url> [--duration 30] [--out /path/to/out.mp3]');
  process.exit(1);
}

console.log(`Stream URL : ${streamUrl}`);
console.log(`Duration   : ${durationSec}s`);
console.log(`Output     : ${outputPath}`);
console.log('Recording…  (Ctrl-C to stop early)');

const adapter = createFfmpegDirectStreamAdapter();
const handle = adapter.record({ streamUrl, outputPath, durationSec });

// Allow Ctrl-C to stop gracefully
process.on('SIGINT', () => {
  console.log('\nStopping…');
  handle.stop();
});

try {
  await handle.done;
  console.log(`\nDone. File written to:\n  ${outputPath}`);
  console.log('\nNext steps:');
  console.log('  1. Play the file to confirm audio quality.');
  console.log('  2. Add it as a scheduled job:');
  console.log(`     node business_modules/recording/input/manage-jobs.js add \\`);
  console.log(`       --station "your-station" \\`);
  console.log(`       --url "${streamUrl}" \\`);
  console.log(`       --program "Program Name" \\`);
  console.log(`       --schedule "0-4:18:00" \\`);
  console.log(`       --duration 1800`);
} catch (err) {
  console.error('\nRecording failed:', err.message);
  console.error('\nCommon causes:');
  console.error('  - URL requires authentication or a browser session');
  console.error('  - URL is not a direct audio stream (try extracting from DevTools first)');
  console.error('  - ffmpeg is not installed (apt install ffmpeg)');
  process.exit(1);
}
