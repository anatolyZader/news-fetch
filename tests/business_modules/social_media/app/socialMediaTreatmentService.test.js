import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSocialMediaService } from '../../../../business_modules/social_media/app/socialMediaService.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const fixtureDataDir = resolve(repoRoot, 'business_modules/social_media/data');

describe('socialMediaTreatmentService', () => {
  it('treats OSINT bundle and writes JSON + markdown under data/', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'social-media-'));
    const service = createSocialMediaService({ dataDir: dir });
    const repoService = createSocialMediaService({ dataDir: fixtureDataDir });

    const repoBundle = await repoService.gather.loadBundle('2026-05-21');
    assert.ok(repoBundle, 'fixture signals-social-2026-05-21.json must exist in social_media/data');

    await service.gather.saveBundle('2026-05-21', repoBundle);
    const { signalCount, path, reportPath } = await service.treatment.treatAndSave('2026-05-21');

    assert.ok(signalCount > 0);
    assert.match(path, /business_modules\/social_media\/data|social-media-/);
    assert.match(reportPath, /social-osint-report-2026-05-21\.md$/);

    const saved = JSON.parse(readFileSync(path, 'utf8'));
    assert.ok(Array.isArray(saved.signals));
    assert.equal(saved.signals.length, signalCount);

    const md = readFileSync(reportPath, 'utf8');
    assert.match(md, /# Social OSINT report — 2026-05-21/);
    assert.match(md, /## Findings/);

    rmSync(dir, { recursive: true, force: true });
  });
});
