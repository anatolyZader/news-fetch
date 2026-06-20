import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REPLAY_REUSE_SOURCE_TYPES,
  replayReuseEnvKey,
  isReplayReuseEnabled,
  shouldReuseInReplay,
  preferReuse,
} from '../../../../../business_modules/resilience/domain/services/replayReuseConfig.js';

describe('replayReuseConfig', () => {
  it('maps source types to env keys', () => {
    assert.equal(replayReuseEnvKey('news'), 'RESILIENCE_REPLAY_REUSE_NEWS');
    assert.equal(replayReuseEnvKey('pbo_regional'), 'RESILIENCE_REPLAY_REUSE_PBO_REGIONAL');
  });

  it('defaults to reuse disabled when unset', () => {
    assert.equal(isReplayReuseEnabled('news', {}), false);
    assert.equal(isReplayReuseEnabled('news', { RESILIENCE_REPLAY_REUSE_NEWS: '0' }), false);
  });

  it('enables reuse for truthy env values', () => {
    assert.equal(isReplayReuseEnabled('field', { RESILIENCE_REPLAY_REUSE_FIELD: '1' }), true);
    assert.equal(isReplayReuseEnabled('field', { RESILIENCE_REPLAY_REUSE_FIELD: 'true' }), true);
    assert.equal(isReplayReuseEnabled('field', { RESILIENCE_REPLAY_REUSE_FIELD: 'on' }), true);
  });

  it('shouldReuseInReplay only applies in replay without force', () => {
    const env = { RESILIENCE_REPLAY_REUSE_NEWS: '1' };
    assert.equal(shouldReuseInReplay('news', { replayMode: true, force: false, env }), true);
    assert.equal(shouldReuseInReplay('news', { replayMode: false, force: false, env }), false);
    assert.equal(shouldReuseInReplay('news', { replayMode: true, force: true, env }), false);
  });

  it('preferReuse keeps today-mode reuse when bundle exists', () => {
    const env = {};
    assert.equal(
      preferReuse({ replayMode: false, sourceType: 'news', force: false, bundleExists: true, env }),
      true,
    );
    assert.equal(
      preferReuse({ replayMode: true, sourceType: 'news', force: false, bundleExists: true, env }),
      false,
    );
  });

  it('lists all pipeline source types', () => {
    assert.ok(REPLAY_REUSE_SOURCE_TYPES.includes('pbo_regional'));
    assert.equal(REPLAY_REUSE_SOURCE_TYPES.length, 8);
  });
});
