import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createClosedSignalBundleFsAdapter } from '../../../../business_modules/resilience_scorer/infrastructure/adapters/closedSignalBundleFsAdapter.js';

describe('closedSignalBundleFsAdapter', () => {
  it('discovers and loads closed signal bundles', () => {
    const root = join(tmpdir(), `closed-bundle-${Date.now()}`);
    const signalsDir = join(root, 'signals');
    mkdirSync(signalsDir, { recursive: true });
    writeFileSync(join(signalsDir, 'signals-news-2026-05-27.json'), JSON.stringify({
      source_type: 'news',
      date: '2026-05-27',
      signals: [{ signal_type: 'panic_behavior', evidence: 'test' }],
      total_articles: 1,
    }));

    const port = createClosedSignalBundleFsAdapter({
      signalsDir,
      fieldSignalsDir: join(root, 'field'),
      socialSignalsDir: join(root, 'social'),
    });

    const discovery = port.discoverBundles({ targetDate: '2026-05-27', days: 1 });
    assert.equal(discovery.anyDirExists, true);

    const loaded = port.loadBundles(discovery, { targetDate: '2026-05-27', enabledSources: null });
    assert.equal(loaded.length, 1);
    assert.equal(loaded[0].sourceType, 'news');
    assert.equal(loaded[0].data.signals.length, 1);

    rmSync(root, { recursive: true, force: true });
  });
});
