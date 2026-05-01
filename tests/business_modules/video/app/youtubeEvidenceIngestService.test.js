import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { YoutubeEvidenceIngestService } from '../../../../business_modules/video/app/youtubeEvidenceIngestService.js';

test('YouTube evidence ingest uses native captions before downloading audio', async () => {
  let downloaded = false;
  const service = new YoutubeEvidenceIngestService({
    transcriptService: {
      async fetchTranscriptSegments() {
        return {
          source: 'yt-dlp',
          segments: [{ speaker: 'CAPTION', text: 'Residents are following instructions.', start: 0, end: 3 }],
        };
      },
    },
    videoGrabService: {
      async downloadFromUrl() {
        downloaded = true;
        return { ok: true, outputPath: '/tmp/audio.mp3' };
      },
    },
    audioEvidenceIngestService: {
      async ingestAudioFileToEvidenceItems() {
        throw new Error('audio fallback should not run when captions are usable');
      },
    },
    async contextualizeTranscript(segments, opts) {
      assert.equal(segments.length, 1);
      assert.equal(opts.sourceUrl, 'https://youtu.be/example');
      return [{ title: 'Scene 1', body: 'Caption-derived evidence.', url: opts.sourceUrl, quality: 'medium' }];
    },
  });

  const result = await service.ingestYoutubeUrlToEvidenceItems({
    url: 'https://youtu.be/example',
    date: '2026-05-01',
    outputDir: '/tmp',
  });

  assert.equal(downloaded, false);
  assert.equal(result.source, 'captions');
  assert.equal(result.transcriptSource, 'yt-dlp');
  assert.deepEqual(result.items, [
    {
      date: '2026-05-01',
      source_type: 'audio',
      source_label: 'youtube',
      source_url: 'https://youtu.be/example',
      title: 'Scene 1',
      body: 'Caption-derived evidence.',
      quality: 'medium',
      published_at: '2026-05-01',
    },
  ]);
});

test('YouTube evidence ingest falls back to audio when captions are unavailable', async () => {
  const calls = [];
  const tmp = await mkdtemp(join(tmpdir(), 'youtube-evidence-test-'));
  const downloadedPath = join(tmp, 'audio.mp3');
  const outputDir = join(tmp, 'videos');
  await writeFile(downloadedPath, 'fake audio bytes');
  const service = new YoutubeEvidenceIngestService({
    transcriptService: {
      async fetchTranscriptSegments() {
        calls.push('captions');
        return { source: 'none', segments: [], ytDlpError: 'no subtitles' };
      },
    },
    videoGrabService: {
      async downloadFromUrl(url, outputDir) {
        calls.push(['download', url, outputDir]);
        return { ok: true, outputPath: downloadedPath };
      },
    },
    audioEvidenceIngestService: {
      async ingestAudioFileToEvidenceItems(args) {
        calls.push(['audio', args]);
        return [{ title: 'Audio scene' }];
      },
    },
    async contextualizeTranscript() {
      throw new Error('caption contextualization should not run without captions');
    },
  });

  try {
    const result = await service.ingestYoutubeUrlToEvidenceItems({
      url: 'https://youtu.be/example',
      date: '2026-05-01',
      outputDir,
    });

    assert.equal(result.source, 'audio-fallback');
    assert.deepEqual(result.errors, ['yt-dlp captions: no subtitles']);
    assert.deepEqual(result.items, [{ title: 'Audio scene' }]);
    assert.deepEqual(calls, [
      'captions',
      ['download', 'https://youtu.be/example', outputDir],
      [
        'audio',
        {
          filePath: join(outputDir, 'retained', 'audio.mp3'),
          date: '2026-05-01',
          sourceUrl: 'https://youtu.be/example',
          sourceLabel: 'youtube',
        },
      ],
    ]);
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
});
