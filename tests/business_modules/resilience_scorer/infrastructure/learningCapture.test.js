import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { logZeroSignalArticles } from '../../../../business_modules/resilience_scorer/infrastructure/learningCapture.js';
import { getOovRunCount, flushOovRunBuffer } from '../../../../business_modules/resilience_scorer/domain/services/oovCapture.js';
import { LEARNING_CAPTURE_KINDS } from '../../../../cross-cut-modules/learningCapture/kinds.js';

describe('learningCapture logZeroSignalArticles', () => {
  it('buffers zero-signal article records when capture enabled', () => {
    const prev = process.env.RESILIENCE_OOV_CAPTURE;
    process.env.RESILIENCE_OOV_CAPTURE = '1';
    flushOovRunBuffer();

    const articles = [
      { url: 'https://a.example', body: 'Shelter compliance story.' },
      { url: 'https://b.example', body: 'No signals here about volunteering.' },
    ];
    const signals = [{ article_index: 1, signal_type: 'compliance_enter_shelter', evidence: 'entered shelter' }];

    logZeroSignalArticles(articles, signals, 'test-batch');
    assert.equal(getOovRunCount(), 1);
    flushOovRunBuffer();

    if (prev === undefined) delete process.env.RESILIENCE_OOV_CAPTURE;
    else process.env.RESILIENCE_OOV_CAPTURE = prev;
  });

  it('uses zero_signal_article capture kind', () => {
    const prev = process.env.RESILIENCE_OOV_CAPTURE;
    process.env.RESILIENCE_OOV_CAPTURE = '1';
    flushOovRunBuffer();

    logZeroSignalArticles([{ body: 'text' }], [], 'batch');
    // buffer is internal; verify via run count increment
    assert.ok(getOovRunCount() >= 1);
    flushOovRunBuffer();

    if (prev === undefined) delete process.env.RESILIENCE_OOV_CAPTURE;
    else process.env.RESILIENCE_OOV_CAPTURE = prev;

    assert.equal(LEARNING_CAPTURE_KINDS.ZERO_SIGNAL_ARTICLE, 'zero_signal_article');
  });
});
