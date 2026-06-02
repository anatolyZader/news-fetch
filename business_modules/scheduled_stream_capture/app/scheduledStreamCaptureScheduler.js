/**
 * Polls the recording_jobs table every POLL_INTERVAL_MS and starts any due stream captures.
 *
 * Schedule resolution is done in Israel time (Asia/Jerusalem).  A job slot is
 * considered "due" when the current Israel time is within DETECTION_WINDOW_MIN
 * minutes after the scheduled HH:MM.  The deduplication key stored in
 * recording_runs is "YYYY-MM-DDTHH:MM" in Israel local time, so even if the
 * poller fires multiple times in the same minute only one run is ever created.
 *
 * Dependency injection:
 *   store   — createScheduledStreamCaptureJobStore(...)
 *   adapter — createFfmpegDirectStreamAdapter()
 *   onComplete({ job, runId, outputPath, date }) — called after FFmpeg exits cleanly;
 *              wire this to AudioIngestService.ingestToMarkdown() in the entry point.
 *   capturesBaseDir — absolute path where output files are written
 *
 * Usage:
 *   const scheduler = createScheduledStreamCaptureScheduler({ store, adapter, onComplete, capturesBaseDir });
 *   scheduler.start();
 *   // later:
 *   scheduler.stop();
 */

import { join } from 'node:path';

const POLL_INTERVAL_MS = 30_000;   // poll every 30 seconds
const DETECTION_WINDOW_MIN = 5;    // consider a slot "due" for up to 5 minutes after HH:MM
const IL_TZ = 'Asia/Jerusalem';
const LOG_PREFIX = '[stream-capture]';

/** Returns Israel-time components for the given Date. */
function ilTimeParts(date) {
  const numericParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: IL_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );

  const dowStr = new Intl.DateTimeFormat('en-US', {
    timeZone: IL_TZ,
    weekday: 'short',
  }).format(date);
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeek = DOW.indexOf(dowStr);

  return {
    dateStr: `${numericParts.year}-${numericParts.month}-${numericParts.day}`,
    hour: Number.parseInt(numericParts.hour, 10),
    minute: Number.parseInt(numericParts.minute, 10),
    dayOfWeek,
  };
}

/**
 * @param {{ dayOfWeek: number[], hour: number, minute: number }} slot
 * @param {Date} now
 * @returns {string|null}
 */
function scheduledStartIfDue(slot, now) {
  const { dateStr, hour, minute, dayOfWeek } = ilTimeParts(now);

  if (!slot.dayOfWeek.includes(dayOfWeek)) return null;

  const nowMinutes = hour * 60 + minute;
  const slotMinutes = slot.hour * 60 + slot.minute;
  const diff = nowMinutes - slotMinutes;

  if (diff < 0 || diff >= DETECTION_WINDOW_MIN) return null;

  return `${dateStr}T${String(slot.hour).padStart(2, '0')}:${String(slot.minute).padStart(2, '0')}`;
}

function slugify(str) {
  return str
    .toLowerCase()
    .replaceAll(/[^a-z0-9א-ת]+/g, '-')
    .replaceAll(/^-+|-+$/g, '');
}

export function createScheduledStreamCaptureScheduler({ store, adapter, onComplete, capturesBaseDir }) {
  const activeCaptures = new Map();
  let pollTimer = null;
  let running = false;

  async function startCapture({ job, runId, scheduledStart }) {
    const date = scheduledStart.slice(0, 10);
    const outputPath = join(
      capturesBaseDir,
      job.station,
      date,
      slugify(job.program),
      runId,
      'recording.mp3',
    );

    store.updateRun(runId, {
      status: 'recording',
      actual_start_at: new Date().toISOString(),
      output_path: outputPath,
    });

    console.log(`${LOG_PREFIX} START  job=${job.id} run=${runId} station=${job.station} program="${job.program}" duration=${job.duration_sec}s`);

    const handle = adapter.record({
      streamUrl: job.stream_url,
      outputPath,
      durationSec: job.duration_sec,
    });
    activeCaptures.set(runId, handle);

    try {
      await handle.done;
      const endedAt = new Date().toISOString();
      store.updateRun(runId, { status: 'completed', actual_end_at: endedAt });
      console.log(`${LOG_PREFIX} DONE   run=${runId} → ${outputPath}`);

      if (onComplete) {
        try {
          await onComplete({ job, runId, outputPath, date, scheduledStart });
        } catch (err) {
          console.error(`${LOG_PREFIX} onComplete error for run ${runId}:`, err.message);
        }
      }
    } catch (err) {
      store.updateRun(runId, {
        status: 'failed',
        actual_end_at: new Date().toISOString(),
        error_msg: err.message,
      });
      console.error(`${LOG_PREFIX} FAILED run=${runId}:`, err.message);
    } finally {
      activeCaptures.delete(runId);
    }
  }

  async function poll() {
    const now = new Date();
    let jobs;
    try {
      jobs = store.getEnabledJobs();
    } catch (err) {
      console.error(`${LOG_PREFIX} poll error reading jobs:`, err.message);
      return;
    }

    for (const job of jobs) {
      for (const slot of job.schedule) {
        const scheduledStart = scheduledStartIfDue(slot, now);
        if (!scheduledStart) continue;

        let run;
        try {
          run = store.createRunIfNotExists({ jobId: job.id, scheduledStartAt: scheduledStart });
        } catch (err) {
          console.error(`${LOG_PREFIX} failed to create run for job ${job.id}:`, err.message);
          continue;
        }

        if (!run.created) continue;

        startCapture({ job, runId: run.id, scheduledStart }).catch(() => {});
      }
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      console.log(`${LOG_PREFIX} Scheduler started (poll every ${POLL_INTERVAL_MS / 1000}s, timezone: ${IL_TZ})`);
      poll().catch(() => {});
      pollTimer = setInterval(() => poll().catch(() => {}), POLL_INTERVAL_MS);
    },

    stop() {
      if (!running) return;
      running = false;
      clearInterval(pollTimer);
      pollTimer = null;
      for (const [runId, handle] of activeCaptures) {
        console.log(`${LOG_PREFIX} Stopping in-flight capture run=${runId}`);
        handle.stop();
      }
      console.log(`${LOG_PREFIX} Scheduler stopped.`);
    },

    pollNow: () => poll(),

    activeCount: () => activeCaptures.size,
  };
}
