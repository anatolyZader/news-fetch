import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseWebVttToSegments } from '../../../../../business_modules/video/domain/services/parseWebVtt.js';

describe('parseWebVtt', () => {
  it('parses cues and strips tags', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:04.000
Hello <c>world</c>

00:00:05.500 --> 00:00:07.000
Second line
`;
    const segs = parseWebVttToSegments(vtt);
    assert.strictEqual(segs.length, 2);
    assert.strictEqual(segs[0].text, 'Hello world');
    assert.strictEqual(segs[0].start, 1);
    assert.strictEqual(segs[0].end, 4);
    assert.strictEqual(segs[1].text, 'Second line');
  });

  it('handles two-part timestamps', () => {
    const vtt = `WEBVTT

00:02.500 --> 00:05.000
Short format
`;
    const segs = parseWebVttToSegments(vtt);
    assert.strictEqual(segs.length, 1);
    assert.ok(Math.abs(segs[0].start - 2.5) < 0.001);
  });
});
