/**
 * Integration test: records 10 minutes from every station in parallel,
 * then transcribes each recording and verifies transcription output.
 *
 * Requires OPENAI_API_KEY in env.
 *
 * Run:
 *   node --test tests/business_modules/scheduled_stream_capture/recordAndTranscribe.integration.test.js
 */

import 'dotenv/config';
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, statSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createScheduledStreamCaptureJobStore } from '../../../business_modules/scheduled_stream_capture/infrastructure/scheduledStreamCaptureJobStore.js';
import { createScheduledStreamCaptureScheduler } from '../../../business_modules/scheduled_stream_capture/app/scheduledStreamCaptureScheduler.js';
import { createFfmpegDirectStreamAdapter } from '../../../business_modules/scheduled_stream_capture/infrastructure/adapters/ffmpegDirectStreamAdapter.js';
import { AudioIngestService } from '../../../business_modules/audio/app/audioIngestService.js';
import { OpenaiTranscriptionAdapter } from '../../../business_modules/audio/infrastructure/adapters/openaiTranscriptionAdapter.js';

const CLIP_DURATION_SEC = 600; // 10 minutes
const SETTLE_TIMEOUT_MS = 720_000; // 12 min max wait

function transcriptionFailureMessage(failCount, transcriptionFailures) {
  const details = transcriptionFailures.map((f) => f.station + ': ' + f.error).join('; ');
  return 'At most 1 transcription failure allowed (music-only stream). Failed ' + failCount + ': ' + details;
}

describe('recordAndTranscribe', { timeout: 1_800_000 }, () => {
  const testDbPath = join(tmpdir(), `rec-trans-${Date.now()}.sqlite`);
  const testRecDir = join(tmpdir(), `rec-trans-out-${Date.now()}`);
  const testStore = createScheduledStreamCaptureJobStore(testDbPath);
  const adapter = createFfmpegDirectStreamAdapter();

  // Read production jobs for station/stream info
  const prodDbPath = join(import.meta.dirname, '..', '..', '..', 'db', 'app.sqlite');
  const prodStore = createScheduledStreamCaptureJobStore(prodDbPath);
  const prodJobs = prodStore.getEnabledJobs();

  // Deduplicate by stream_url
  const stationStreams = new Map();
  for (const job of prodJobs) {
    if (!stationStreams.has(job.stream_url)) {
      stationStreams.set(job.stream_url, { station: job.station, language: job.language });
    }
  }

  // Schedule all for "right now"
  function ilNow() {
    const now = new Date();
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(now).map((p) => [p.type, p.value]),
    );
    const dowStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem', weekday: 'short',
    }).format(now);
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      dayOfWeek: DOW.indexOf(dowStr),
      hour: Number.parseInt(parts.hour, 10),
      minute: Number.parseInt(parts.minute, 10),
    };
  }

  const { dayOfWeek, hour, minute } = ilNow();
  const testJobs = [];

  for (const [streamUrl, { station, language }] of stationStreams) {
    const id = testStore.addJob({
      station: `test-${station}`,
      streamUrl,
      program: `10min test ${station}`,
      schedule: [{ dayOfWeek: [dayOfWeek], hour, minute }],
      durationSec: CLIP_DURATION_SEC,
      language,
    });
    testJobs.push({ id, station, streamUrl, language });
  }

  after(() => {
    try { if (existsSync(testDbPath)) rmSync(testDbPath); } catch { /* ignore */ }
    try { if (existsSync(testRecDir)) rmSync(testRecDir, { recursive: true }); } catch { /* ignore */ }
  });

  it(`records ${CLIP_DURATION_SEC}s from ${stationStreams.size} stations and transcribes each`, async (t) => {
    if (!process.env.OPENAI_API_KEY) {
      t.skip('OPENAI_API_KEY not set (skipping record+transcribe integration test)');
      return;
    }
    if (stationStreams.size === 0) {
      t.skip('No stations found in production DB (skipping record+transcribe integration test)');
      return;
    }

    // --- Phase 1: Record all stations in parallel ---
    console.log(`\n  Phase 1: Recording ${CLIP_DURATION_SEC}s from ${stationStreams.size} stations in parallel...`);

    const completions = [];
    const scheduler = createScheduledStreamCaptureScheduler({
      store: testStore,
      adapter,
      onComplete: (info) => completions.push(info),
      capturesBaseDir: testRecDir,
    });

    await scheduler.pollNow();

    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    while (scheduler.activeCount() > 0 && Date.now() < deadline) {
      const elapsed = Math.round((Date.now() - (deadline - SETTLE_TIMEOUT_MS)) / 1000);
      const active = scheduler.activeCount();
      if (elapsed % 30 === 0) {
        console.log(`    ... ${elapsed}s elapsed, ${active} still recording`);
      }
      await new Promise((r) => setTimeout(r, 1000));
    }

    // Verify all recordings completed
    const runs = testStore.listRuns();
    const recordingResults = [];

    for (const { id, station, streamUrl, language } of testJobs) {
      const run = runs.find((r) => r.job_id === id);
      assert.ok(run, `run should exist for ${station}`);

      if (run.status === 'completed' && existsSync(run.output_path)) {
        const size = statSync(run.output_path).size;
        console.log(`    ✓ ${station} recorded — ${(size / 1024).toFixed(0)} KB`);
        recordingResults.push({ station, outputPath: run.output_path, language, streamUrl });
      } else {
        console.log(`    ✗ ${station} — ${run.status}: ${run.error_msg || 'unknown'}`);
      }
    }

    assert.ok(recordingResults.length > 0, 'at least one recording should succeed');
    console.log(`\n  Phase 1 complete: ${recordingResults.length}/${testJobs.length} recordings succeeded\n`);

    // --- Phase 2: Transcribe each recording in parallel ---
    console.log(`  Phase 2: Transcribing ${recordingResults.length} recordings in parallel...`);

    const transcriptionAdapter = new OpenaiTranscriptionAdapter();
    const transcriptionResults = [];
    const transcriptionFailures = [];

    const transcribeOne = async ({ station, outputPath, language }) => {
      const svc = new AudioIngestService({ adapter: transcriptionAdapter });
      const useWhisper = language !== 'he';
      const mdPath = join(testRecDir, `transcript-${station}.md`);
      const t0 = Date.now();

      try {
        const result = await svc.ingestToMarkdown({
          filePath: outputPath,
          date: new Date().toISOString().slice(0, 10),
          station,
          program: `10min test ${station}`,
          outPath: mdPath,
          contextualize: false,
          useWhisper,
          language,
        });

        const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
        const mdContent = readFileSync(mdPath, 'utf8');
        const wordCount = mdContent.split(/\s+/).length;

        console.log(`    ✓ ${station} — ${result.articleBlocks} blocks, ${result.segmentCount} segments, ${wordCount} words, ${elapsed}s (${useWhisper ? 'whisper' : 'diarize'}, lang=${language})`);
        transcriptionResults.push({
          station, language, blocks: result.articleBlocks,
          segments: result.segmentCount, words: wordCount, mdPath,
        });
      } catch (err) {
        console.log(`    ✗ ${station} — transcription failed: ${err.message}`);
        transcriptionFailures.push({ station, error: err.message });
      }
    };

    await Promise.all(recordingResults.map(transcribeOne));

    console.log(`\n  Phase 2 complete: ${transcriptionResults.length}/${recordingResults.length} transcriptions succeeded\n`);

    // --- Assertions ---
    for (const tr of transcriptionResults) {
      assert.ok(tr.segments > 0, `${tr.station} should have segments`);
      assert.ok(tr.blocks > 0, `${tr.station} should have article blocks`);
      assert.ok(tr.words > 50, `${tr.station} should have meaningful text (got ${tr.words} words)`);

      // Verify markdown file is well-formed
      const md = readFileSync(tr.mdPath, 'utf8');
      assert.ok(md.startsWith('# Audio recordings'), `${tr.station} markdown should have header`);
      assert.ok(md.includes('## 1.'), `${tr.station} markdown should have at least one article block`);
    }

    // Allow at most 1 failure (a station playing only music during the test window)
    const failCount = transcriptionFailures.length;
    assert.ok(failCount <= 1, transcriptionFailureMessage(failCount, transcriptionFailures));
    assert.ok(transcriptionResults.length >= recordingResults.length - 1,
      `At least ${recordingResults.length - 1}/${recordingResults.length} stations should transcribe successfully (got ${transcriptionResults.length})`);
  });
});
