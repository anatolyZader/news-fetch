import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createScheduledStreamCaptureJobStore } from '../../../business_modules/scheduled_stream_capture/infrastructure/scheduledStreamCaptureJobStore.js';

describe('scheduledStreamCaptureJobStore', () => {
  const dbPath = join(tmpdir(), `rec-store-test-${Date.now()}.sqlite`);
  const store = createScheduledStreamCaptureJobStore(dbPath);

  after(() => {
    try { if (existsSync(dbPath)) unlinkSync(dbPath); } catch { /* ignore */ }
  });

  const sampleJob = {
    station: 'test-station',
    streamUrl: 'https://example.com/stream',
    program: 'Test Program 09:00-11:00',
    schedule: [{ dayOfWeek: [0, 1, 2, 3, 4], hour: 9, minute: 0 }],
    durationSec: 7200,
    language: 'he',
  };

  describe('addJob / listJobs', () => {
    it('creates a job and returns its id', () => {
      const id = store.addJob(sampleJob);
      assert.ok(id, 'should return a UUID');
      assert.match(id, /^[0-9a-f-]{36}$/);
    });

    it('lists created jobs with parsed schedule', () => {
      const jobs = store.listJobs();
      assert.ok(jobs.length >= 1);
      const job = jobs.find((j) => j.station === 'test-station');
      assert.ok(job);
      assert.deepStrictEqual(job.schedule, sampleJob.schedule);
      assert.strictEqual(job.program, sampleJob.program);
      assert.strictEqual(job.duration_sec, 7200);
      assert.strictEqual(job.language, 'he');
      assert.strictEqual(job.enabled, true);
    });
  });

  describe('getEnabledJobs', () => {
    it('returns only enabled jobs', () => {
      const id = store.addJob({ ...sampleJob, station: 'disabled-station' });
      store.setJobEnabled(id, false);
      const enabled = store.getEnabledJobs();
      assert.ok(enabled.every((j) => j.enabled === true));
      assert.ok(!enabled.find((j) => j.station === 'disabled-station'));
    });
  });

  describe('setJobEnabled', () => {
    it('toggles job enabled flag', () => {
      const id = store.addJob({ ...sampleJob, station: 'toggle-station' });
      store.setJobEnabled(id, false);
      let jobs = store.listJobs();
      assert.strictEqual(jobs.find((j) => j.id === id).enabled, false);

      store.setJobEnabled(id, true);
      jobs = store.listJobs();
      assert.strictEqual(jobs.find((j) => j.id === id).enabled, true);
    });
  });

  describe('deleteJob', () => {
    it('removes job and its runs', () => {
      const id = store.addJob({ ...sampleJob, station: 'delete-me' });
      store.createRunIfNotExists({ jobId: id, scheduledStartAt: '2026-04-01T09:00' });

      store.deleteJob(id);

      const jobs = store.listJobs();
      assert.ok(!jobs.find((j) => j.id === id));
      const runs = store.listRuns();
      assert.ok(!runs.find((r) => r.job_id === id));
    });
  });

  describe('createRunIfNotExists', () => {
    it('creates a new run and returns created=true', () => {
      const jobId = store.addJob({ ...sampleJob, station: 'run-test' });
      const result = store.createRunIfNotExists({ jobId, scheduledStartAt: '2026-04-02T09:00' });
      assert.ok(result.id);
      assert.strictEqual(result.created, true);
    });

    it('returns created=false for duplicate scheduled_start_at', () => {
      const jobId = store.addJob({ ...sampleJob, station: 'dedup-test' });
      const first = store.createRunIfNotExists({ jobId, scheduledStartAt: '2026-04-03T09:00' });
      const second = store.createRunIfNotExists({ jobId, scheduledStartAt: '2026-04-03T09:00' });
      assert.strictEqual(first.created, true);
      assert.strictEqual(second.created, false);
      assert.strictEqual(first.id, second.id);
    });
  });

  describe('updateRun', () => {
    it('partially updates run fields', () => {
      const jobId = store.addJob({ ...sampleJob, station: 'update-test' });
      const { id: runId } = store.createRunIfNotExists({ jobId, scheduledStartAt: '2026-04-04T09:00' });

      store.updateRun(runId, { status: 'recording', actual_start_at: '2026-04-04T09:00:05Z' });
      let run = store.getRunById(runId);
      assert.strictEqual(run.status, 'recording');
      assert.strictEqual(run.actual_start_at, '2026-04-04T09:00:05Z');

      store.updateRun(runId, { status: 'completed', actual_end_at: '2026-04-04T11:00:00Z' });
      run = store.getRunById(runId);
      assert.strictEqual(run.status, 'completed');
      assert.strictEqual(run.actual_end_at, '2026-04-04T11:00:00Z');
    });
  });

  describe('listRuns', () => {
    it('returns runs with denormalized station and program', () => {
      const jobId = store.addJob({ ...sampleJob, station: 'list-runs-test' });
      store.createRunIfNotExists({ jobId, scheduledStartAt: '2026-04-05T09:00' });
      const runs = store.listRuns({ limit: 100 });
      const run = runs.find((r) => r.job_id === jobId);
      assert.ok(run);
      assert.strictEqual(run.station, 'list-runs-test');
      assert.strictEqual(run.program, sampleJob.program);
    });
  });

  describe('language column', () => {
    it('defaults to he', () => {
      const id = store.addJob({ ...sampleJob, station: 'lang-default' });
      const job = store.listJobs().find((j) => j.id === id);
      assert.strictEqual(job.language, 'he');
    });

    it('accepts custom language', () => {
      const id = store.addJob({ ...sampleJob, station: 'lang-am', language: 'am' });
      const job = store.listJobs().find((j) => j.id === id);
      assert.strictEqual(job.language, 'am');
    });
  });
});
