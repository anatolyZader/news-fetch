import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isOpenPipelineExtractEnabled } from '../../../../business_modules/signals_extraction/domain/services/openPipelineConfig.js';
import { runPipelineOpenExtract } from '../../../../business_modules/signals_extraction/app/pipelineOpenExtractService.js';

describe('pipelineOpenExtractService', () => {
  it('isOpenPipelineExtractEnabled defaults off', () => {
    assert.equal(isOpenPipelineExtractEnabled({}), false);
    assert.equal(isOpenPipelineExtractEnabled({ RESILIENCE_OPEN_EXTRACT_PARALLEL: '1' }), true);
    assert.equal(isOpenPipelineExtractEnabled({ RESILIENCE_OPEN_EXTRACT_PARALLEL: '0' }), false);
  });

  it('runPipelineOpenExtract returns null when disabled', async () => {
    const result = await runPipelineOpenExtract({
      articles: [{ body: 'test' }],
      sourceType: 'news',
      date: '2026-04-03',
      env: { RESILIENCE_OPEN_EXTRACT_PARALLEL: '0' },
    });
    assert.equal(result, null);
  });

  it('runPipelineOpenExtract returns null for empty articles', async () => {
    const result = await runPipelineOpenExtract({
      articles: [],
      sourceType: 'news',
      date: '2026-04-03',
      env: { RESILIENCE_OPEN_EXTRACT_PARALLEL: '1' },
    });
    assert.equal(result, null);
  });
});
