/**
 * Integration smoke test: schedules a 10-second recording from every station
 * in the live database, runs the scheduler, and verifies each produces a
 * non-empty MP3 file.
 *
 * This test hits real external streams — skip with:
 *   node --test --test-name-pattern '(?!liveStreamSmoke)' ...
 *
 * Run only this test:
 *   node --test tests/business_modules/scheduled_stream_capture/liveStreamSmoke.integration.test.js
 */

import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync, statSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createScheduledStreamCaptureJobStore } from '../../../business_modules/scheduled_stream_capture/infrastructure/scheduledStreamCaptureJobStore.js';
import { createScheduledStreamCaptureScheduler } from '../../../business_modules/scheduled_stream_capture/app/scheduledStreamCaptureScheduler.js';
import { createFfmpegDirectStreamAdapter } from '../../../business_modules/scheduled_stream_capture/infrastructure/adapters/ffmpegDirectStreamAdapter.js';

const CLIP_DURATION_SEC = 10;
const SETTLE_TIMEOUT_MS = 30_000; // max wait for all recordings to finish

describe('liveStreamSmoke', () => {
  const testDbPath = join(tmpdir(), `rec-smoke-${Date.now()}.sqlite`);
  const testRecDir = join(tmpdir(), `rec-smoke-out-${Date.now()}`);
  const testStore = createScheduledStreamCaptureJobStore(testDbPath);
  const adapter = createFfmpegDirectStreamAdapter();

  // Collect all unique station→streamUrl pairs from the production database
  const prodDbPath = join(import.meta.dirname, '..', '..', '..', 'db', 'app.sqlite');
  const prodStore = createScheduledStreamCaptureJobStore(prodDbPath);
  const prodJobs = prodStore.getEnabledJobs();

  // Deduplicate by stream_url (multiple jobs on the same station share a URL)
  const stationStreams = new Map();
  for (const job of prodJobs) {
    if (!stationStreams.has(job.stream_url)) {
      stationStreams.set(job.stream_url, job.station);
    }
  }

  // Create temporary test jobs scheduled for "right now"
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
  const testJobIds = [];

  for (const [streamUrl, station] of stationStreams) {
    const id = testStore.addJob({
      station: `smoke-${station}`,
      streamUrl,
      program: `Smoke test ${station}`,
      schedule: [{ dayOfWeek: [dayOfWeek], hour, minute }],
      durationSec: CLIP_DURATION_SEC,
    });
    testJobIds.push({ id, station, streamUrl });
  }

  after(() => {
    try { if (existsSync(testDbPath)) unlinkSync(testDbPath); } catch { /* ignore */ }
    try { if (existsSync(testRecDir)) rmSync(testRecDir, { recursive: true }); } catch { /* ignore */ }
  });

  it(`records a ${CLIP_DURATION_SEC}s clip from each station (${stationStreams.size} streams)`, async (t) => {
    if (stationStreams.size === 0) {
      t.skip('No stations found in production DB (skipping smoke test)');
      return;
    }

    const completions = [];
    const failures = [];

    const scheduler = createScheduledStreamCaptureScheduler({
      store: testStore,
      adapter,
      onComplete: (info) => completions.push(info),
      capturesBaseDir: testRecDir,
    });

    // Trigger a single poll cycle — this fires off all recordings concurrently
    await scheduler.pollNow();

    // Wait for all recordings to finish (they run in parallel)
    const deadline = Date.now() + SETTLE_TIMEOUT_MS;
    while (scheduler.activeCount() > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 500));
    }

    // Check results from DB
    const runs = testStore.listRuns();
    console.log(`\n  Smoke test results (${runs.length} runs):`);

    for (const { id, station, streamUrl } of testJobIds) {
      const run = runs.find((r) => r.job_id === id);
      assert.ok(run, `run should exist for ${station}`);

      if (run.status === 'completed') {
        const fileExists = existsSync(run.output_path);
        const fileSize = fileExists ? statSync(run.output_path).size : 0;
        console.log(`    ✓ ${station} — ${fileSize} bytes — ${run.output_path}`);
        assert.ok(fileExists, `output file should exist for ${station}`);
        assert.ok(fileSize > 1000, `output file for ${station} should be > 1KB (got ${fileSize})`);
      } else {
        console.log(`    ✗ ${station} — ${run.status}: ${run.error_msg || 'unknown'}`);
        failures.push({ station, streamUrl, status: run.status, error: run.error_msg });
      }
    }

    if (failures.length > 0) {
      console.log(`\n  ${failures.length} station(s) failed:`);
      for (const f of failures) {
        console.log(`    - ${f.station}: ${f.error}`);
        console.log(`      URL: ${f.streamUrl}`);
      }
    }

    assert.strictEqual(failures.length, 0,
      `All stations should record successfully. Failed: ${failures.map((f) => f.station).join(', ')}`);
  });
});
