import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createScheduledStreamCaptureJobStore } from '../../../business_modules/scheduled_stream_capture/infrastructure/scheduledStreamCaptureJobStore.js';
import { createScheduledStreamCaptureScheduler } from '../../../business_modules/scheduled_stream_capture/app/scheduledStreamCaptureScheduler.js';

describe('scheduledStreamCaptureScheduler', () => {
  const dbPath = join(tmpdir(), `rec-sched-test-${Date.now()}.sqlite`);
  const store = createScheduledStreamCaptureJobStore(dbPath);
  const recordingsDir = join(tmpdir(), `rec-sched-out-${Date.now()}`);

  after(() => {
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
  });

  /** Returns Israel-time day-of-week and HH:MM for a given Date. */
  function ilNow(date) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(date).map((p) => [p.type, p.value]),
    );
    const dowStr = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem', weekday: 'short',
    }).format(date);
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return {
      dayOfWeek: DOW.indexOf(dowStr),
      hour: parseInt(parts.hour, 10),
      minute: parseInt(parts.minute, 10),
    };
  }

  describe('poll detection', () => {
    it('detects a due job and calls adapter.record()', async () => {
      const now = new Date();
      const { dayOfWeek, hour, minute } = ilNow(now);

      const jobId = store.addJob({
        station: 'poll-test',
        streamUrl: 'https://example.com/stream',
        program: 'Poll Test',
        schedule: [{ dayOfWeek: [dayOfWeek], hour, minute }],
        durationSec: 5,
      });

      let recordCalled = false;
      let recordArgs = null;
      const mockAdapter = {
        record(args) {
          recordCalled = true;
          recordArgs = args;
          return {
            stop: () => {},
            pid: 999,
            done: Promise.resolve({ outputPath: args.outputPath }),
          };
        },
      };

      const completions = [];
      const scheduler = createScheduledStreamCaptureScheduler({
        store,
        adapter: mockAdapter,
        onComplete: (info) => completions.push(info),
        capturesBaseDir: recordingsDir,
      });

      await scheduler.pollNow();
      // Allow async startRecording to settle
      await new Promise((r) => setTimeout(r, 50));

      assert.ok(recordCalled, 'adapter.record() should have been called');
      assert.strictEqual(recordArgs.durationSec, 5);
      assert.ok(recordArgs.streamUrl.includes('example.com'));

      // Verify run was created in DB
      const runs = store.listRuns();
      const run = runs.find((r) => r.job_id === jobId);
      assert.ok(run, 'a run should exist for the job');
      assert.strictEqual(run.status, 'completed');

      // onComplete should have been called
      assert.strictEqual(completions.length, 1);
      assert.strictEqual(completions[0].job.id, jobId);

      store.deleteJob(jobId);
    });

    it('does not trigger a job scheduled for a different day', async () => {
      const now = new Date();
      const { dayOfWeek, hour, minute } = ilNow(now);
      const otherDay = (dayOfWeek + 1) % 7;

      const jobId = store.addJob({
        station: 'wrong-day',
        streamUrl: 'https://example.com/stream',
        program: 'Wrong Day',
        schedule: [{ dayOfWeek: [otherDay], hour, minute }],
        durationSec: 5,
      });

      let recordCalled = false;
      const mockAdapter = {
        record() {
          recordCalled = true;
          return { stop: () => {}, pid: 999, done: Promise.resolve({ outputPath: '' }) };
        },
      };

      const scheduler = createScheduledStreamCaptureScheduler({
        store, adapter: mockAdapter, capturesBaseDir: recordingsDir,
      });
      await scheduler.pollNow();
      await new Promise((r) => setTimeout(r, 50));

      assert.ok(!recordCalled, 'should not record on wrong day');
      store.deleteJob(jobId);
    });

    it('does not trigger a job scheduled for a different hour', async () => {
      const now = new Date();
      const { dayOfWeek, hour } = ilNow(now);
      const otherHour = (hour + 6) % 24;

      const jobId = store.addJob({
        station: 'wrong-hour',
        streamUrl: 'https://example.com/stream',
        program: 'Wrong Hour',
        schedule: [{ dayOfWeek: [dayOfWeek], hour: otherHour, minute: 0 }],
        durationSec: 5,
      });

      let recordCalled = false;
      const mockAdapter = {
        record() {
          recordCalled = true;
          return { stop: () => {}, pid: 999, done: Promise.resolve({ outputPath: '' }) };
        },
      };

      const scheduler = createScheduledStreamCaptureScheduler({
        store, adapter: mockAdapter, capturesBaseDir: recordingsDir,
      });
      await scheduler.pollNow();
      await new Promise((r) => setTimeout(r, 50));

      assert.ok(!recordCalled, 'should not record at wrong hour');
      store.deleteJob(jobId);
    });
  });

  describe('deduplication', () => {
    it('does not start a second recording for the same slot', async () => {
      const now = new Date();
      const { dayOfWeek, hour, minute } = ilNow(now);

      const jobId = store.addJob({
        station: 'dedup-sched',
        streamUrl: 'https://example.com/stream',
        program: 'Dedup Test',
        schedule: [{ dayOfWeek: [dayOfWeek], hour, minute }],
        durationSec: 5,
      });

      let recordCount = 0;
      const mockAdapter = {
        record(args) {
          recordCount++;
          return {
            stop: () => {},
            pid: 999,
            done: Promise.resolve({ outputPath: args.outputPath }),
          };
        },
      };

      const scheduler = createScheduledStreamCaptureScheduler({
        store, adapter: mockAdapter, capturesBaseDir: recordingsDir,
      });

      await scheduler.pollNow();
      await new Promise((r) => setTimeout(r, 50));
      await scheduler.pollNow();
      await new Promise((r) => setTimeout(r, 50));

      assert.strictEqual(recordCount, 1, 'should only record once for the same slot');
      store.deleteJob(jobId);
    });
  });

  describe('disabled jobs', () => {
    it('does not trigger disabled jobs', async () => {
      const now = new Date();
      const { dayOfWeek, hour, minute } = ilNow(now);

      const jobId = store.addJob({
        station: 'disabled-test',
        streamUrl: 'https://example.com/stream',
        program: 'Disabled',
        schedule: [{ dayOfWeek: [dayOfWeek], hour, minute }],
        durationSec: 5,
      });
      store.setJobEnabled(jobId, false);

      let recordCalled = false;
      const mockAdapter = {
        record() {
          recordCalled = true;
          return { stop: () => {}, pid: 999, done: Promise.resolve({ outputPath: '' }) };
        },
      };

      const scheduler = createScheduledStreamCaptureScheduler({
        store, adapter: mockAdapter, capturesBaseDir: recordingsDir,
      });
      await scheduler.pollNow();
      await new Promise((r) => setTimeout(r, 50));

      assert.ok(!recordCalled, 'disabled job should not record');
      store.deleteJob(jobId);
    });
  });

  describe('error handling', () => {
    it('marks run as failed when adapter rejects', async () => {
      const now = new Date();
      const { dayOfWeek, hour, minute } = ilNow(now);

      const jobId = store.addJob({
        station: 'fail-test',
        streamUrl: 'https://example.com/stream',
        program: 'Fail Test',
        schedule: [{ dayOfWeek: [dayOfWeek], hour, minute }],
        durationSec: 5,
      });

      const mockAdapter = {
        record() {
          return {
            stop: () => {},
            pid: 999,
            done: Promise.reject(new Error('ffmpeg crashed')),
          };
        },
      };

      const scheduler = createScheduledStreamCaptureScheduler({
        store, adapter: mockAdapter, capturesBaseDir: recordingsDir,
      });
      await scheduler.pollNow();
      await new Promise((r) => setTimeout(r, 100));

      const runs = store.listRuns();
      const run = runs.find((r) => r.job_id === jobId);
      assert.strictEqual(run.status, 'failed');
      assert.ok(run.error_msg.includes('ffmpeg crashed'));
      store.deleteJob(jobId);
    });
  });

  describe('start / stop', () => {
    it('starts and stops without error', () => {
      const mockAdapter = {
        record() {
          return { stop: () => {}, pid: 999, done: Promise.resolve({ outputPath: '' }) };
        },
      };
      const scheduler = createScheduledStreamCaptureScheduler({
        store, adapter: mockAdapter, capturesBaseDir: recordingsDir,
      });
      scheduler.start();
      assert.strictEqual(scheduler.activeCount(), 0);
      scheduler.stop();
    });
  });
});
