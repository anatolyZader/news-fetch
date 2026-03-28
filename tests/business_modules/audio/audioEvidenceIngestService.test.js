import { describe, it } from 'node:test';
import assert from 'node:assert';
import { AudioEvidenceIngestService } from '../../../business_modules/audio/app/audioEvidenceIngestService.js';

describe('AudioEvidenceIngestService', () => {
  it('transcribes downloaded audio and returns audio evidence items', async () => {
    const service = new AudioEvidenceIngestService({
      audioDownloadPort: {
        async downloadToTempFile() {
          return { filePath: '/tmp/audio-url-test/fake.mp3', contentType: 'audio/mpeg' };
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
      contextualizer: async (segments, { station, program, sourceUrl }) => [
        {
          title: `${station} — ${program} — scene 1: Alarm compliance`,
          body: segments.map((s) => s.text).join(' '),
          quality: 'high',
          url: sourceUrl || null,
        },
      ],
    });

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
  });
});
