import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { runExtractObservationsCli } from '../../../../business_modules/open_observation_extraction/app/extractObservationsCli.js';

const REPO_ROOT = resolve(import.meta.dirname, '../../../..');
const CLI_ENTRY = resolve(REPO_ROOT, 'business_modules/open_observation_extraction/input/extract-observations.js');

describe('extractObservationsCli', () => {
  it('exports runExtractObservationsCli as a function', () => {
    assert.equal(typeof runExtractObservationsCli, 'function');
  });

  it('exits with usage error when --files is omitted', () => {
    const result = spawnSync(process.execPath, [CLI_ENTRY], {
      cwd: REPO_ROOT,
      env: { ...process.env, ANTHROPIC_API_KEY: 'test-key' },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--files is required/);
  });
});
