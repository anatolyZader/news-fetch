import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  REPLAY_REUSE_SOURCE_TYPES,
  replayReuseEnvKey,
  isReplayReuseEnabled,
  shouldReuseInReplay,
  preferReuse,
  applyDefaultReplayReuseEnv,
} from '../../../../../business_modules/resilience_scorer/domain/services/pipeline/replayReuseConfig.js';

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
    assert.equal(isReplayReuseEnabled('visits', { RESILIENCE_REPLAY_REUSE_VISITS: '1' }), true);
    assert.equal(isReplayReuseEnabled('visits', { RESILIENCE_REPLAY_REUSE_VISITS: 'true' }), true);
    assert.equal(isReplayReuseEnabled('visits', { RESILIENCE_REPLAY_REUSE_VISITS: 'on' }), true);
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

  it('applyDefaultReplayReuseEnv enables preset sources when unset', () => {
    const env = {};
    const enabled = applyDefaultReplayReuseEnv('8comp-north-replay', env);
    assert.deepEqual(enabled.sort(), ['news', 'pbo', 'visits', 'whatsapp'].sort());
    assert.equal(env.RESILIENCE_REPLAY_REUSE_NEWS, '1');
    assert.equal(isReplayReuseEnabled('news', env), true);
  });

  it('applyDefaultReplayReuseEnv does not override explicit env', () => {
    const env = { RESILIENCE_REPLAY_REUSE_NEWS: '0' };
    const enabled = applyDefaultReplayReuseEnv('8comp-north-replay', env);
    assert.ok(!enabled.includes('news'));
    assert.equal(env.RESILIENCE_REPLAY_REUSE_NEWS, '0');
  });
});
