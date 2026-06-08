#!/usr/bin/env node
/**
 * Daemon entry point: wires the SQLite store, FFmpeg adapter, AudioIngestService,
 * and starts the scheduled stream capture scheduler.
 *
 * Usage:
 *   node business_modules/scheduled_stream_capture/input/start-scheduler.js
 *
 * Env:
 *   SQLITE_PATH       (default: ./db/app.sqlite)
 *   OPENAI_API_KEY    (required for transcription after capture)
 *   RECORDINGS_DIR    (default: business_modules/scheduled_stream_capture/data)
 *
 * The scheduler:
 *   1. Polls every 30s for jobs whose scheduled time has come (Israel timezone).
 *   2. Launches FFmpeg to capture the stream.
 *   3. On completion, transcribes the audio via OpenAI and appends to articles-audio.md.
 *
 * You can run this standalone or integrate it into server.js alongside the Fastify app.
 */

import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createScheduledStreamCaptureJobStore } from '../infrastructure/scheduledStreamCaptureJobStore.js';
import { createFfmpegDirectStreamAdapter } from '../infrastructure/adapters/ffmpegDirectStreamAdapter.js';
import { createScheduledStreamCaptureScheduler } from '../app/scheduledStreamCaptureScheduler.js';
import { defaultStreamCapturesDir } from '../infrastructure/scheduledStreamCaptureDataPaths.js';
import { OpenaiTranscriptionAdapter, AudioIngestService } from '../../audio/index.js';

const execFileAsync = promisify(execFile);
const LOG_PREFIX = '[stream-capture]';

const __dirname = dirname(fileURLToPath(import.meta.url));

const sqlitePath = process.env.SQLITE_PATH?.trim()
  ? resolve(process.env.SQLITE_PATH.trim())
  : resolve(__dirname, '..', '..', '..', 'db', 'app.sqlite');

const capturesBaseDir = process.env.RECORDINGS_DIR?.trim()
  ? resolve(process.env.RECORDINGS_DIR.trim())
  : defaultStreamCapturesDir();

const store   = createScheduledStreamCaptureJobStore(sqlitePath);
const adapter = createFfmpegDirectStreamAdapter();

const transcriptionAdapter = new OpenaiTranscriptionAdapter();
const audioIngestService   = new AudioIngestService({ adapter: transcriptionAdapter });

async function onCaptureComplete({ job, runId, outputPath, date, scheduledStart }) {
  console.log(`${LOG_PREFIX} Transcribing run=${runId} file=${outputPath}`);
  const safeSlot = scheduledStart.replaceAll(':', '-');
  const mdPath = resolve(__dirname, '..', '..', '..', `articles-audio-${job.station}-${safeSlot}.md`);
  const useWhisper = job.language !== 'he';
  try {
    const result = await audioIngestService.ingestToMarkdown({
      filePath: outputPath,
      date,
      station: job.station,
      program: job.program,
      outPath: mdPath,
      contextualize: true,
      useWhisper,
      language: job.language,
    });
    console.log(
      `${LOG_PREFIX} Transcription done run=${runId}  blocks=${result.articleBlocks}  segments=${result.segmentCount}  → ${mdPath}`,
    );

    const repoRoot = resolve(__dirname, '..', '..', '..');
    try {
      await execFileAsync('git', ['add', mdPath], { cwd: repoRoot });
      await execFileAsync('git', ['commit', '-m', `data: auto-transcribe ${job.station} ${scheduledStart}`], { cwd: repoRoot });
      await execFileAsync('git', ['push', 'origin', 'HEAD'], { cwd: repoRoot });
      console.log(`${LOG_PREFIX} Pushed transcript to repo  run=${runId}`);
    } catch (gitErr) {
      console.error(`${LOG_PREFIX} Git push failed run=${runId}:`, gitErr.message);
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} Transcription failed run=${runId}:`, err.message);
  }
}

const scheduler = createScheduledStreamCaptureScheduler({
  store,
  adapter,
  onComplete: onCaptureComplete,
  capturesBaseDir,
});

scheduler.start();

function shutdown(signal) {
  console.log(`\n${LOG_PREFIX} Received ${signal} — shutting down…`);
  scheduler.stop();
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log(`${LOG_PREFIX} SQLite : ${sqlitePath}`);
console.log(`${LOG_PREFIX} Output : ${capturesBaseDir}`);
console.log(`${LOG_PREFIX} Waiting for scheduled jobs…  (Ctrl-C to stop)`);
