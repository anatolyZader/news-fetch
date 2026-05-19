/**
 * Polls the recording_jobs table every POLL_INTERVAL_MS and starts any due recordings.
 *
 * Schedule resolution is done in Israel time (Asia/Jerusalem).  A job slot is
 * considered "due" when the current Israel time is within DETECTION_WINDOW_MIN
 * minutes after the scheduled HH:MM.  The deduplication key stored in
 * recording_runs is "YYYY-MM-DDTHH:MM" in Israel local time, so even if the
 * poller fires multiple times in the same minute only one run is ever created.
 *
 * Dependency injection:
 *   store   — createRecordingJobStore(...)
 *   adapter — createFfmpegDirectStreamAdapter()
 *   onComplete({ job, runId, outputPath, date }) — called after FFmpeg exits cleanly;
 *              wire this to AudioIngestService.ingestToMarkdown() in the entry point.
 *   recordingsBaseDir — absolute path where output files are written
 *
 * Usage:
 *   const scheduler = createRecordingScheduler({ store, adapter, onComplete, recordingsBaseDir });
 *   scheduler.start();
 *   // later:
 *   scheduler.stop();
 */

import { join } from 'path';

const POLL_INTERVAL_MS = 30_000;   // poll every 30 seconds
const DETECTION_WINDOW_MIN = 5;    // consider a slot "due" for up to 5 minutes after HH:MM
const IL_TZ = 'Asia/Jerusalem';

/** Returns Israel-time components for the given Date. */
function ilTimeParts(date) {
  // Use a more reliable approach: separate calls for numeric parts vs weekday
  const numericParts = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: IL_TZ,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date).map((p) => [p.type, p.value]),
  );

  // Day-of-week: use JS Date shifted to Israel local midnight to get getDay()
  // Simpler: format as a known weekday abbreviation via 'en-US' which gives Sun/Mon/...
  const dowStr = new Intl.DateTimeFormat('en-US', {
    timeZone: IL_TZ,
    weekday: 'short',
  }).format(date); // "Sun", "Mon", ...
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayOfWeek = DOW.indexOf(dowStr);

  return {
    dateStr: `${numericParts.year}-${numericParts.month}-${numericParts.day}`,
    hour: parseInt(numericParts.hour, 10),
    minute: parseInt(numericParts.minute, 10),
    dayOfWeek, // 0=Sun … 6=Sat
  };
}

/**
 * Checks whether `now` falls within [slot_time, slot_time + DETECTION_WINDOW_MIN).
 * Returns the canonical scheduled_start_at key if due, otherwise null.
 *
 * @param {{ dayOfWeek: number[], hour: number, minute: number }} slot
 * @param {Date} now
 * @returns {string|null}  e.g. "2026-03-24T18:00"
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

/**
 * Derive a filesystem-safe directory name from the program label.
 * e.g. "Evening News (18:00)" → "evening-news-18-00"
 */
function slugify(str) {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9א-ת]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createRecordingScheduler({ store, adapter, onComplete, recordingsBaseDir }) {
  const activeRecordings = new Map(); // runId → handle
  let pollTimer = null;
  let running = false;

  async function startRecording({ job, runId, scheduledStart }) {
    const date = scheduledStart.slice(0, 10); // YYYY-MM-DD
    const outputPath = join(
      recordingsBaseDir,
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

    console.log(`[recording] START  job=${job.id} run=${runId} station=${job.station} program="${job.program}" duration=${job.duration_sec}s`);

    const handle = adapter.record({
      streamUrl: job.stream_url,
      outputPath,
      durationSec: job.duration_sec,
    });
    activeRecordings.set(runId, handle);

    try {
      await handle.done;
      const endedAt = new Date().toISOString();
      store.updateRun(runId, { status: 'completed', actual_end_at: endedAt });
      console.log(`[recording] DONE   run=${runId} → ${outputPath}`);

      if (onComplete) {
        try {
          await onComplete({ job, runId, outputPath, date, scheduledStart });
        } catch (err) {
          console.error(`[recording] onComplete error for run ${runId}:`, err.message);
        }
      }
    } catch (err) {
      store.updateRun(runId, {
        status: 'failed',
        actual_end_at: new Date().toISOString(),
        error_msg: err.message,
      });
      console.error(`[recording] FAILED run=${runId}:`, err.message);
    } finally {
      activeRecordings.delete(runId);
    }
  }

  async function poll() {
    const now = new Date();
    let jobs;
    try {
      jobs = store.getEnabledJobs();
    } catch (err) {
      console.error('[recording] poll error reading jobs:', err.message);
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
          console.error(`[recording] failed to create run for job ${job.id}:`, err.message);
          continue;
        }

        if (!run.created) {
          // run already exists — either in progress or completed; skip
          continue;
        }

        // Fire-and-forget; errors are caught inside startRecording
        startRecording({ job, runId: run.id, scheduledStart }).catch(() => {});
      }
    }
  }

  return {
    start() {
      if (running) return;
      running = true;
      console.log(`[recording] Scheduler started (poll every ${POLL_INTERVAL_MS / 1000}s, timezone: ${IL_TZ})`);
      // Run immediately, then on interval
      poll().catch(() => {});
      pollTimer = setInterval(() => poll().catch(() => {}), POLL_INTERVAL_MS);
    },

    stop() {
      if (!running) return;
      running = false;
      clearInterval(pollTimer);
      pollTimer = null;
      // Stop any in-flight recordings gracefully
      for (const [runId, handle] of activeRecordings) {
        console.log(`[recording] Stopping in-flight recording run=${runId}`);
        handle.stop();
      }
      console.log('[recording] Scheduler stopped.');
    },

    /** For testing: trigger one poll cycle immediately. */
    pollNow: () => poll(),

    activeCount: () => activeRecordings.size,
  };
}
