#!/usr/bin/env node
/**
 * Idempotent setup: registers רדיו צפון 104.5FM morning broadcast jobs
 * in the scheduled stream capture scheduler.
 *
 * Run once (or re-run safely — skips if already configured):
 *   npm run radio:setup
 *
 * Registers two daily recording slots, Sun–Thu (Israel timezone):
 *   06:00 – 09:00  קפאין (יואב מינץ) + סלוצקי ודומינגז
 *   09:00 – 12:00  המשך משדרי הבוקר (גדי נס / ליאת רון / אראל סג"ל)
 *
 * Stream: https://radio.streamgates.net/stream/1045fm  (128 kbps MP3, Icecast)
 * Fallback stream: https://cdn.cybercdn.live/Tzafon_NonStop/Live_Audio/icecast.audio
 *
 * After setup, start the capture scheduler daemon:
 *   npm run capture:start
 *
 * Each completed recording is automatically transcribed and written to:
 *   articles-audio-tzafon-1045-<YYYY-MM-DD>T<HH-MM>.md
 *
 * To analyze a morning's transcripts for resilience signals:
 *   npm run extract-signals -- --source-type radio \
 *     --files articles-audio-tzafon-1045-<date>T06-00.md \
 *     --date <date>
 *   npm run assess-signals -- --date <date> --days 1 --scope national
 */

import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createScheduledStreamCaptureJobStore } from '../../scheduled_stream_capture/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sqlitePath = process.env.SQLITE_PATH?.trim()
  ? resolve(process.env.SQLITE_PATH.trim())
  : resolve(__dirname, '..', '..', '..', 'db', 'app.sqlite');

const STATION    = 'tzafon-1045';
const STREAM_URL = 'https://radio.streamgates.net/stream/1045fm';

// Sun=0 Mon=1 Tue=2 Wed=3 Thu=4  (Israeli work week)
const WEEKDAYS = [0, 1, 2, 3, 4];

const MORNING_JOBS = [
  {
    program:     'משדרי הבוקר – קפאין וסלוצקי ודומינגז',
    hour:        6,
    durationSec: 3 * 3600,   // 06:00–09:00
  },
  {
    program:     'משדרי הבוקר – המשך',
    hour:        9,
    durationSec: 3 * 3600,   // 09:00–12:00
  },
];

const DAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const store = createScheduledStreamCaptureJobStore(sqlitePath);

// ── Idempotency check ──────────────────────────────────────────────────────

const existing = store.listJobs().filter((j) => j.station === STATION);

if (existing.length > 0) {
  console.log(`${existing.length} job(s) already registered for station "${STATION}" — nothing to do.`);
  console.log('Run `npm run radio:jobs list` to review. To reset: delete existing jobs then re-run.\n');
  for (const j of existing) {
    const status = j.enabled ? '[ON] ' : '[OFF]';
    console.log(`  ${status} ${j.id}  ${j.program}`);
  }
  process.exit(0);
}

// ── Register jobs ──────────────────────────────────────────────────────────

for (const job of MORNING_JOBS) {
  const id = store.addJob({
    station:     STATION,
    streamUrl:   STREAM_URL,
    program:     job.program,
    schedule:    [{ dayOfWeek: WEEKDAYS, hour: job.hour, minute: 0 }],
    durationSec: job.durationSec,
  });

  const days  = WEEKDAYS.map((d) => DAY_ABBR[d]).join('/');
  const start = `${String(job.hour).padStart(2, '0')}:00`;
  const end   = `${String(job.hour + 3).padStart(2, '0')}:00`;

  console.log(`Created job ${id}`);
  console.log(`  Program  : ${job.program}`);
  console.log(`  Schedule : ${days}  ${start} – ${end}  (Israel timezone)`);
  console.log(`  Duration : ${job.durationSec / 3600}h`);
  console.log();
}

console.log(`Station  : ${STATION}`);
console.log(`Stream   : ${STREAM_URL}`);
console.log('\nSetup complete. Start the scheduler daemon to begin recording:');
console.log('  npm run capture:start');
