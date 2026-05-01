import { describe, it } from 'node:test';
import assert from 'node:assert';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AudioEvidenceIngestService } from '../../../business_modules/audio/app/audioEvidenceIngestService.js';

describe('AudioEvidenceIngestService', () => {
  it('transcribes downloaded audio and returns audio evidence items', async () => {
    const tmp = await mkdtemp(join(tmpdir(), 'audio-evidence-test-'));
    const filePath = join(tmp, 'fake.mp3');
    await writeFile(filePath, 'fake audio bytes');
    const service = new AudioEvidenceIngestService({
      audioDownloadPort: {
        async downloadToTempFile() {
          return { filePath, contentType: 'audio/mpeg' };
        },
      },
      transcriptionPort: {
        async transcribeDiarized() {
          return {
            segments: [
              { speaker: 'SPEAKER_00', text: 'Residents followed the alarm instructions.', start: 0, end: 5 },
              { speaker: 'SPEAKER_01', text: 'Shelter entry happened in under one minute.', start: 8, end: 14 },
            ],
          };
        },
      },
    });

    try {
      const items = await service.ingestAudioUrlToEvidenceItems({
        url: 'https://cdn.example.com/evidence/audio-1.mp3',
        date: '2026-03-24',
      });

      assert.ok(items.length > 0);
      assert.strictEqual(items[0].date, '2026-03-24');
      assert.strictEqual(items[0].source_type, 'audio');
      assert.strictEqual(items[0].source_url, 'https://cdn.example.com/evidence/audio-1.mp3');
      assert.ok(items[0].title.includes('Submitted audio'));
      assert.ok(items[0].body.includes('Residents followed the alarm instructions.'));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });

  it('falls back to whisper when diarized transcription rejects the audio file', async () => {
    const calls = [];
    const tmp = await mkdtemp(join(tmpdir(), 'audio-evidence-test-'));
    const filePath = join(tmp, 'fallback.mp3');
    await writeFile(filePath, 'fake audio bytes');
    const service = new AudioEvidenceIngestService({
      audioDownloadPort: {
        async downloadToTempFile() {
          return { filePath, contentType: 'audio/mpeg' };
        },
      },
      transcriptionPort: {
        async transcribeDiarized() {
          calls.push('diarized');
          const err = new Error('Audio file might be corrupted or unsupported');
          err.status = 400;
          throw err;
        },
        async transcribeWhisperPlain() {
          calls.push('whisper');
          return {
            segments: [
              { speaker: 'TRANSCRIPT', text: 'Fallback transcript succeeded.', start: undefined, end: undefined },
            ],
          };
        },
      },
    });

    try {
      const items = await service.ingestAudioUrlToEvidenceItems({
        url: 'https://cdn.example.com/evidence/fallback.mp3',
        date: '2026-03-24',
      });

      assert.deepStrictEqual(calls, ['diarized', 'whisper']);
      assert.ok(items[0].body.includes('Fallback transcript succeeded.'));
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});
