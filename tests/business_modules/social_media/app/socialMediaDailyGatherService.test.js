import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createSocialMediaFsAdapter } from '../../../../business_modules/social_media/infrastructure/adapters/socialMediaFsAdapter.js';
import { createSocialMediaGatherService } from '../../../../business_modules/social_media/app/socialMediaGatherService.js';
import { createSocialMediaTreatmentService } from '../../../../business_modules/social_media/app/socialMediaTreatmentService.js';
import { createSocialMediaDailyGatherService } from '../../../../business_modules/social_media/app/socialMediaDailyGatherService.js';

describe('socialMediaDailyGatherService', () => {
  it('dry-run does not call searchRecent', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'sm-daily-'));
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const gatherService = createSocialMediaGatherService({ persistencePort });
    const treatmentService = createSocialMediaTreatmentService({ persistencePort });

    let searchCalls = 0;
    const xApiClient = {
      async countsRecent() {
        return { meta: { total_tweet_count: 5 } };
      },
      async searchRecent() {
        searchCalls += 1;
        return { data: [], includes: { users: [] } };
      },
    };

    const service = createSocialMediaDailyGatherService({
      persistencePort,
      gatherService,
      treatmentService,
      xApiClient,
      telegramFetchAdapter: null,
      dataDir,
    });

    const result = await service.gatherDaily({
      date: '2026-05-23',
      days: 1,
      north: true,
      execute: false,
      force: true,
    });

    assert.equal(result.mode, 'dry_run');
    assert.equal(searchCalls, 0);
  });

  it('reuses fresh bundle without force', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'sm-daily-'));
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const gatherService = createSocialMediaGatherService({ persistencePort });
    const treatmentService = createSocialMediaTreatmentService({ persistencePort });

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const bundle = gatherService.createEmptyBundle({ date: today, windowDays: 1 });
    bundle.extracted_at = new Date().toISOString();
    bundle.findings = [{
      id: 'x-1',
      quote_original: 'תושבים נכנסים למקלט בנהריה',
      platform: 'x',
      date: today,
    }];
    await persistencePort.saveBundle(today, bundle);

    let countsCalls = 0;
    const xApiClient = {
      async countsRecent() {
        countsCalls += 1;
        return { meta: { total_tweet_count: 0 } };
      },
      async searchRecent() {
        throw new Error('should not search');
      },
    };

    const service = createSocialMediaDailyGatherService({
      persistencePort,
      gatherService,
      treatmentService,
      xApiClient,
      dataDir,
    });

    const result = await service.gatherDaily({
      date: today,
      days: 1,
      north: true,
      execute: true,
      force: false,
    });

    assert.equal(result.mode, 'reuse');
    assert.equal(countsCalls, 0);
  });

  it('rejects invalid date', async () => {
    const dataDir = mkdtempSync(join(tmpdir(), 'sm-daily-'));
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const gatherService = createSocialMediaGatherService({ persistencePort });
    const treatmentService = createSocialMediaTreatmentService({ persistencePort });
    const service = createSocialMediaDailyGatherService({
      persistencePort,
      gatherService,
      treatmentService,
      dataDir,
    });

    await assert.rejects(
      () => service.gatherDaily({ date: 'bad-date', execute: false }),
      /YYYY-MM-DD/,
    );
  });

  it('execute path classifies behavior posts and saves bundles', async () => {
    const anchorDate = new Date().toISOString().slice(0, 10);
    const dataDir = mkdtempSync(join(tmpdir(), 'sm-daily-'));
    const persistencePort = createSocialMediaFsAdapter({ dataDir });
    const gatherService = createSocialMediaGatherService({ persistencePort });
    const treatmentService = createSocialMediaTreatmentService({ persistencePort });

    const xApiClient = {
      async countsRecent() {
        return { meta: { total_tweet_count: 1 } };
      },
      async searchRecent() {
        return {
          data: [{
            id: '9001',
            author_id: '1',
            text: 'תושבים נכנסים למקלט בנהריה אחרי האזעקה',
            created_at: `${anchorDate}T08:00:00.000Z`,
          }],
          includes: { users: [{ id: '1', username: 'north_user' }] },
        };
      },
    };

    const service = createSocialMediaDailyGatherService({
      persistencePort,
      gatherService,
      treatmentService,
      xApiClient,
      telegramFetchAdapter: null,
      dataDir,
      classifyCandidates: async (candidates) => ({
        findings: candidates.map((c) => ({
          id: c.id,
          date: anchorDate,
          platform: c.platform,
          quote_original: c.text,
          resilience_component: 'functional_continuity',
        })),
        rejected: {},
        rejected_examples: [],
      }),
    });

    const result = await service.gatherDaily({
      date: anchorDate,
      days: 1,
      north: true,
      execute: true,
      force: true,
      platforms: ['x'],
    });

    assert.equal(result.mode, 'execute');
    assert.ok(result.findingsCount >= 1);
    assert.ok(result.bundlePaths.length >= 1);
  });
});
