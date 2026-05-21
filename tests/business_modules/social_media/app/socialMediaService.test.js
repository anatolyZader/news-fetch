import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSocialMediaService } from '../../../../business_modules/social_media/app/socialMediaService.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('socialMediaService.getDashboard', () => {
  it('lists bundles from data dir', async () => {
    const service = createSocialMediaService({
      dataDir: resolve(repoRoot, 'business_modules/social_media/data'),
    });
    const dash = await service.getDashboard();
    assert.ok(Array.isArray(dash.dates));
    assert.ok(dash.dates.length >= 1);
    assert.equal(dash.dates[0].date, '2026-05-21');
    assert.ok(dash.dates[0].findingCount > 0);
  });

  it('loads full report for a date', async () => {
    const service = createSocialMediaService({
      dataDir: resolve(repoRoot, 'business_modules/social_media/data'),
    });
    const report = await service.getReport('2026-05-21');
    assert.ok(report?.bundle);
    assert.ok(Array.isArray(report.bundle.findings));
    assert.ok(report.markdown?.includes('Social OSINT report'));
  });

  it('lists platforms and daily feed endpoints', async () => {
    const service = createSocialMediaService({
      dataDir: resolve(repoRoot, 'business_modules/social_media/data'),
    });
    const platforms = service.getPlatforms();
    assert.ok(Array.isArray(platforms.platforms));
    assert.ok(platforms.platforms.some((p) => p.id === 'x'));

    const feed = await service.getDailyFeed('2026-05-21');
    assert.ok(feed?.categories?.length >= 1);

    const topicResult = await service.fetchByTopic({ topic: 'ממ"ד', platforms: ['x'] });
    assert.equal(topicResult.topic, 'ממ"ד');
    assert.ok(Array.isArray(topicResult.posts));
  });
});
