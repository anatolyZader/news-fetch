import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { applyPipelinePreset, getPipelinePreset, PIPELINE_PRESETS } from '../../../../business_modules/resilience/app/pipelinePresets.js';
import { parsePipelineCliArgs } from '../../../../business_modules/resilience/app/pipelineOrchestrator.js';

describe('pipelinePresets', () => {
  it('defines all 8comp slash command presets', () => {
    for (const name of ['8comp', '8comp-3', '8comp-3-north', '8comp-7', '8comp-7-north']) {
      assert.ok(PIPELINE_PRESETS[name], name);
    }
  });

  it('8comp-3-north enables always-reextract', () => {
    const applied = applyPipelinePreset(getPipelinePreset('8comp-3-north'), { replayMode: false });
    assert.equal(applied.scope, 'north');
    assert.equal(applied.days, 3);
    assert.equal(applied.ingestPolicy, 'always-reextract');
  });

  it('8comp-3 uses refresh in today national mode', () => {
    const applied = applyPipelinePreset(getPipelinePreset('8comp-3'), { replayMode: false });
    assert.equal(applied.ingestPolicy, 'refresh');
  });

  it('8comp-7-north uses reuse-first', () => {
    const applied = applyPipelinePreset(getPipelinePreset('8comp-7-north'), { replayMode: true });
    assert.equal(applied.ingestPolicy, 'reuse-first');
  });
});

describe('parsePipelineCliArgs presets', () => {
  it('expands --preset 8comp-3-north', () => {
    const opts = parsePipelineCliArgs(['--preset', '8comp-3-north', '--date', '2026-04-15']);
    assert.equal(opts.scope, 'north');
    assert.equal(opts.days, 3);
    assert.equal(opts.ingestPolicy, 'always-reextract');
  });

  it('parses dd/mm/yyyy positional date', () => {
    const opts = parsePipelineCliArgs(['15/04/2026', '--preset', '8comp-3']);
    assert.equal(opts.targetDate, '2026-04-15');
  });
});
