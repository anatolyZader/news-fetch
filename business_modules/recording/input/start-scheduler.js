#!/usr/bin/env node
/**
 * Daemon entry point: wires the SQLite store, FFmpeg adapter, AudioIngestService,
 * and starts the recording scheduler.
 *
 * Usage:
 *   node business_modules/recording/input/start-scheduler.js
 *
 * Env:
 *   SQLITE_PATH       (default: ./db/app.sqlite)
 *   OPENAI_API_KEY    (required for transcription after recording)
 *   RECORDINGS_DIR    (default: business_modules/recording/data)
 *
 * The scheduler:
 *   1. Polls every 30s for jobs whose scheduled time has come (Israel timezone).
 *   2. Launches FFmpeg to record the stream.
 *   3. On completion, transcribes the audio via OpenAI and appends to articles-audio.md.
 *
 * You can run this standalone or integrate it into server.js alongside the Fastify app.
 */

import 'dotenv/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRecordingJobStore } from '../infrastructure/recordingJobStore.js';
import { createFfmpegDirectStreamAdapter } from '../infrastructure/adapters/ffmpegDirectStreamAdapter.js';
import { createRecordingScheduler } from '../app/recordingScheduler.js';
import { defaultRecordingsDir } from '../infrastructure/recordingDataPaths.js';
import { OpenaiTranscriptionAdapter } from '../../audio/infrastructure/adapters/openaiTranscriptionAdapter.js';
import { AudioIngestService } from '../../audio/app/audioIngestService.js';

const execFileAsync = promisify(execFile);

const __dirname = dirname(fileURLToPath(import.meta.url));

const sqlitePath = process.env.SQLITE_PATH?.trim()
  ? resolve(process.env.SQLITE_PATH.trim())
  : resolve(__dirname, '..', '..', '..', 'db', 'app.sqlite');

const recordingsBaseDir = process.env.RECORDINGS_DIR?.trim()
  ? resolve(process.env.RECORDINGS_DIR.trim())
  : defaultRecordingsDir();

// ---------------------------------------------------------------------------
// Wire dependencies
// ---------------------------------------------------------------------------

const store   = createRecordingJobStore(sqlitePath);
const adapter = createFfmpegDirectStreamAdapter();

const transcriptionAdapter = new OpenaiTranscriptionAdapter();
const audioIngestService   = new AudioIngestService({ adapter: transcriptionAdapter });

/**
 * Called by the scheduler after each successful recording.
 * Transcribes the MP3 and appends results to articles-audio.md so it flows
 * into the existing resilience analysis pipeline.
 */
async function onRecordingComplete({ job, runId, outputPath, date, scheduledStart }) {
  console.log(`[recording] Transcribing run=${runId} file=${outputPath}`);
  // Each recording slot gets its own file: articles-audio-<station>-<date>T<HH-MM>.md
  // This avoids overwrites when multiple programs run on the same day.
  const safeSlot = scheduledStart.replaceAll(':', '-'); // "2026-03-24T18-00"
  const mdPath = resolve(__dirname, '..', '..', '..', `articles-audio-${job.station}-${safeSlot}.md`);
  // gpt-4o-transcribe-diarize only supports Hebrew; use whisper-1 for other languages
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
      `[recording] Transcription done run=${runId}  blocks=${result.articleBlocks}  segments=${result.segmentCount}  → ${mdPath}`,
    );

    // Auto-commit and push the transcript to the repo
    const repoRoot = resolve(__dirname, '..', '..', '..');
    try {
      await execFileAsync('git', ['add', mdPath], { cwd: repoRoot });
      await execFileAsync('git', ['commit', '-m', `data: auto-transcribe ${job.station} ${scheduledStart}`], { cwd: repoRoot });
      await execFileAsync('git', ['push', 'origin', 'HEAD'], { cwd: repoRoot });
      console.log(`[recording] Pushed transcript to repo  run=${runId}`);
    } catch (gitErr) {
      console.error(`[recording] Git push failed run=${runId}:`, gitErr.message);
    }
  } catch (err) {
    console.error(`[recording] Transcription failed run=${runId}:`, err.message);
  }
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

const scheduler = createRecordingScheduler({
  store,
  adapter,
  onComplete: onRecordingComplete,
  recordingsBaseDir,
});

scheduler.start();

// Graceful shutdown
function shutdown(signal) {
  console.log(`\n[recording] Received ${signal} — shutting down…`);
  scheduler.stop();
  process.exit(0);
}
process.on('SIGINT',  () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

console.log(`[recording] SQLite : ${sqlitePath}`);
console.log(`[recording] Output : ${recordingsBaseDir}`);
console.log('[recording] Waiting for scheduled jobs…  (Ctrl-C to stop)');
