import { describe, it } from 'node:test';
import assert from 'node:assert';
import { extractYoutubeVideoId } from '../../../../../business_modules/video/domain/services/youtubeVideoId.js';

describe('youtubeVideoId', () => {
  it('extracts id from watch URL', () => {
    assert.strictEqual(
      extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      'dQw4w9WgXcQ',
    );
  });

  it('extracts id from youtu.be', () => {
    assert.strictEqual(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  });

  it('extracts id from shorts', () => {
    assert.strictEqual(
      extractYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'),
      'dQw4w9WgXcQ',
    );
  });

  it('returns null for non-youtube', () => {
    assert.strictEqual(extractYoutubeVideoId('https://example.com/'), null);
  });
});
