import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadOpenObservationsForAssess } from '../../../../business_modules/resilience_scorer/app/loadOpenObservationsForAssess.js';
import { pipelineObservationBundleFilename } from '../../../../business_modules/signals_extraction/domain/services/observationSchema.js';

describe('loadOpenObservationsForAssess', () => {
  it('loads pipeline bundles within assess window', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-obs-'));
    mkdirSync(dir, { recursive: true });
    const date = '2026-04-03';
    const filename = pipelineObservationBundleFilename('news', date);
    writeFileSync(
      join(dir, filename),
      JSON.stringify({
        profile: 'pipeline',
        source_type: 'news',
        date,
        observations: [{
          observation_id: 'obs-1',
          article_index: 1,
          behavioral_description: 'Residents sheltered during alert',
          evidence: 'Residents sheltered during alert',
          confidence: 'high',
        }],
      }),
    );

    const { openObservations, summary } = await loadOpenObservationsForAssess({
      targetDate: date,
      days: 1,
      dataDir: dir,
    });

    assert.equal(openObservations.length, 1);
    assert.equal(openObservations[0].observation_id, 'obs-1');
    assert.equal(openObservations[0].source, 'pipeline');
    assert.equal(summary.count, 1);
    assert.deepEqual(summary.profiles, ['pipeline']);
    assert.ok(summary.bundle_files.includes(filename));
  });

  it('loads social pipeline bundles alongside news', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-obs-social-'));
    mkdirSync(dir, { recursive: true });
    const date = '2026-04-03';
    const socialFile = pipelineObservationBundleFilename('social', date);
    writeFileSync(
      join(dir, socialFile),
      JSON.stringify({
        profile: 'pipeline',
        source_type: 'social',
        date,
        observations: [{
          observation_id: 'obs-social-1',
          article_index: 1,
          behavioral_description: 'Mutual aid post',
          evidence: 'Volunteers organized food delivery',
          confidence: 'medium',
        }],
      }),
    );

    const { openObservations, summary } = await loadOpenObservationsForAssess({
      targetDate: date,
      days: 1,
      dataDir: dir,
    });

    assert.equal(openObservations.length, 1);
    assert.equal(openObservations[0].source_type, 'social');
    assert.ok(summary.bundle_files.includes(socialFile));
  });

  it('loads field pipeline obs outside the assess days window', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'open-obs-field-hist-'));
    mkdirSync(dir, { recursive: true });
    const oldDate = '2026-03-01';
    const targetDate = '2026-04-03';
    const fieldFile = pipelineObservationBundleFilename('field', oldDate);
    writeFileSync(
      join(dir, fieldFile),
      JSON.stringify({
        profile: 'pipeline',
        source_type: 'field',
        date: oldDate,
        observations: [{
          observation_id: 'obs-field-old',
          article_index: 1,
          behavioral_description: 'Older visit observation',
          evidence: 'Older visit observation',
          confidence: 'high',
        }],
      }),
    );

    const { openObservations } = await loadOpenObservationsForAssess({
      targetDate,
      days: 1,
      dataDir: dir,
    });

    assert.equal(openObservations.length, 1);
    assert.equal(openObservations[0].observation_id, 'obs-field-old');
  });
});
