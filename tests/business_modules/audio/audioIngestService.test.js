import { describe, it } from 'node:test';
import assert from 'node:assert';
import { groupSegmentsIntoArticles } from '../../../business_modules/audio/app/audioIngestService.js';

describe('audioIngestService', () => {
  describe('groupSegmentsIntoArticles', () => {
    it('merges consecutive segments into blocks under char budget', () => {
      const segments = [];
      for (let i = 0; i < 5; i++) {
        segments.push({
          speaker: `S${i % 2}`,
          text: 'word '.repeat(50),
          start: i * 10,
          end: (i + 1) * 10,
        });
      }
      const articles = groupSegmentsIntoArticles(segments, { station: 'KAN', program: 'Test' });
      assert.ok(articles.length >= 1);
      assert.ok(articles[0].title.includes('KAN'));
      assert.ok(articles[0].body.includes('S'));
    });

    it('produces multiple blocks when time window exceeded', () => {
      const segments = [
        { speaker: 'A', text: 'short', start: 0, end: 10 },
        { speaker: 'B', text: 'short2', start: 700, end: 710 },
      ];
      const articles = groupSegmentsIntoArticles(segments, { station: 'X', program: 'Y' });
      assert.strictEqual(articles.length, 2);
    });
  });
});
