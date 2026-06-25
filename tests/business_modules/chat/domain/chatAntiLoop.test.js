import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  detectToolCatalogLoop,
  detectUserRestatement,
  shouldPrefetchTimeline,
} from '../../../../business_modules/chat/domain/chatAntiLoop.js';

describe('chatAntiLoop', () => {
  it('detects user restatement', () => {
    assert.equal(detectUserRestatement('i told you what i want in a previous prompt'), true);
    assert.equal(detectUserRestatement('please analyze leadership'), false);
  });

  it('detects tool catalog loop in assistant history', () => {
    const history = [{
      role: 'assistant',
      content: 'Use compare_dates and lookup_signals. What would you like to know about a past date?',
    }];
    assert.equal(detectToolCatalogLoop(history), true);
  });

  it('shouldPrefetchTimeline for temporal slice with component', () => {
    assert.equal(
      shouldPrefetchTimeline({
        message: 'trace information_communication throughout all dates',
        sliceResult: { contextSlice: 'temporal', componentId: 'information_communication' },
      }),
      false,
    );
  });

  it('shouldPrefetchTimeline on user restatement', () => {
    assert.equal(
      shouldPrefetchTimeline({ message: 'i told you what i want in a previous prompt' }),
      true,
    );
  });
});
