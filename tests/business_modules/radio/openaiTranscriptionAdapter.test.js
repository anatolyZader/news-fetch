import { describe, it } from 'node:test';
import assert from 'node:assert';
import { normalizeDiarizedResponse } from '../../../business_modules/radio/infrastructure/adapters/openaiTranscriptionAdapter.js';

describe('openaiTranscriptionAdapter', () => {
  describe('normalizeDiarizedResponse', () => {
    it('maps diarized segments with speaker and timestamps', () => {
      const { segments, fullText } = normalizeDiarizedResponse({
        segments: [
          { speaker: 'SPEAKER_00', text: 'שלום', start: 0, end: 2 },
          { speaker: 'SPEAKER_01', text: 'עולם', start: 2, end: 4 },
        ],
      });
      assert.strictEqual(segments.length, 2);
      assert.strictEqual(segments[0].speaker, 'SPEAKER_00');
      assert.strictEqual(segments[1].text, 'עולם');
      assert(fullText.includes('SPEAKER_00'));
    });

    it('falls back to plain text when no segments', () => {
      const { segments, fullText } = normalizeDiarizedResponse({ text: 'only flat text' });
      assert.strictEqual(segments.length, 0);
      assert.strictEqual(fullText, 'only flat text');
    });
  });
});
