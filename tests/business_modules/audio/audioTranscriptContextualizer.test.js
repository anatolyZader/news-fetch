import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cleanAndMergeSegments } from '../../../business_modules/audio/app/audioTranscriptContextualizer.js';

// Tests cover only the deterministic (non-LLM) parts of the contextualizer.

describe('cleanAndMergeSegments', () => {
  it('drops turns shorter than MIN_TURN_WORDS (4)', () => {
    const segments = [
      { speaker: 'A', text: 'OK', start: 0, end: 1 },
      { speaker: 'A', text: 'Yes sure', start: 1, end: 2 },          // 2 words — drop
      { speaker: 'B', text: 'I am not leaving my home', start: 2, end: 5 }, // keep
    ];
    const result = cleanAndMergeSegments(segments);
    assert.equal(result.length, 1);
    assert.equal(result[0].speaker, 'B');
  });

  it('merges consecutive same-speaker turns', () => {
    const segments = [
      { speaker: 'A', text: 'We stayed in the shelter', start: 0, end: 3 },
      { speaker: 'A', text: 'all night long every night', start: 3, end: 6 },
      { speaker: 'B', text: 'That is very difficult for everyone', start: 6, end: 9 },
    ];
    const result = cleanAndMergeSegments(segments);
    assert.equal(result.length, 2);
    assert.ok(result[0].text.includes('shelter'));
    assert.ok(result[0].text.includes('every night'));
    assert.equal(result[0].tEnd, 6);
    assert.equal(result[1].speaker, 'B');
  });

  it('does not merge turns from different speakers', () => {
    const segments = [
      { speaker: 'A', text: 'We stayed in the shelter all day', start: 0, end: 3 },
      { speaker: 'B', text: 'The shelter was broken and locked', start: 3, end: 6 },
      { speaker: 'A', text: 'We had nowhere else to go then', start: 6, end: 9 },
    ];
    const result = cleanAndMergeSegments(segments);
    assert.equal(result.length, 3);
    assert.equal(result[0].speaker, 'A');
    assert.equal(result[1].speaker, 'B');
    assert.equal(result[2].speaker, 'A');
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(cleanAndMergeSegments([]), []);
  });

  it('returns empty array when all turns are too short', () => {
    const segments = [
      { speaker: 'A', text: 'yes', start: 0, end: 1 },
      { speaker: 'B', text: 'no', start: 1, end: 2 },
    ];
    assert.deepEqual(cleanAndMergeSegments(segments), []);
  });

  it('preserves tStart from first segment and tEnd from last merged segment', () => {
    const segments = [
      { speaker: 'A', text: 'We had to leave the apartment quickly', start: 10, end: 14 },
      { speaker: 'A', text: 'because the sirens were very loud', start: 14, end: 18 },
    ];
    const result = cleanAndMergeSegments(segments);
    assert.equal(result.length, 1);
    assert.equal(result[0].tStart, 10);
    assert.equal(result[0].tEnd, 18);
  });

  it('handles missing start/end timestamps gracefully', () => {
    const segments = [
      { speaker: 'A', text: 'We had no protected space in our building here' },
      { speaker: 'B', text: 'The municipality never fixed these shelters after the war' },
    ];
    const result = cleanAndMergeSegments(segments);
    assert.equal(result.length, 2);
    assert.equal(result[0].tStart, 0);
    assert.equal(result[1].tStart, 0);
  });
});
