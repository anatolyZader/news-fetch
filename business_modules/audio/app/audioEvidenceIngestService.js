import { basename } from 'path';
import { unlinkSync, rmdirSync } from 'fs';
import { AudioIngestService } from './audioIngestService.js';
import { contextualizeTranscript as defaultContextualizer } from './audioTranscriptContextualizer.js';

function safeCleanup(filePath) {
  if (!filePath) return;
  try {
    unlinkSync(filePath);
  } catch {
    /* ignore */
  }
  try {
    const parts = filePath.split('/');
    const dir = parts.slice(0, -1).join('/');
    if (dir.includes('/tmp/audio-url-')) rmdirSync(dir);
  } catch {
    /* ignore */
  }
}

function sourceLabelFromUrl(url) {
  try {
    const u = new URL(url);
    return `audio-url:${u.hostname}`;
  } catch {
    return 'audio-url:unknown';
  }
}

/**
 * App service: URL -> audio file -> transcript blocks -> evidence_items rows.
 */
export class AudioEvidenceIngestService {
  /**
   * @param {{ audioDownloadPort: { downloadToTempFile: Function }, transcriptionPort: object }} deps
   */
  constructor({ audioDownloadPort, transcriptionPort, contextualizer }) {
    this.audioDownloadPort = audioDownloadPort;
    this.audioIngestService = new AudioIngestService({ adapter: transcriptionPort });
    this.contextualizer = contextualizer ?? defaultContextualizer;
  }

  /**
   * @param {{ url: string, date: string }} p
   * @returns {Promise<Array<{date: string, source_type: string, source_label: string, source_url: string, title: string, body: string, published_at: string}>>}
   */
  async ingestAudioUrlToEvidenceItems({ url, date }) {
    const download = await this.audioDownloadPort.downloadToTempFile({ url });
    const filePath = download.filePath;
    try {
      return this.ingestAudioFileToEvidenceItems({
        filePath,
        date,
        sourceUrl: url,
        sourceLabel: sourceLabelFromUrl(url),
      });
    } finally {
      safeCleanup(filePath);
    }
  }

  /**
   * @param {{ filePath: string, date: string, sourceUrl?: string, sourceLabel?: string }} p
   */
  async ingestAudioFileToEvidenceItems({ filePath, date, sourceUrl = '', sourceLabel = 'audio-upload' }) {
    const result = await this.audioIngestService.adapter.transcribeDiarized({ filePath });
    const scenes = await this.contextualizer(result.segments, {
      station: sourceLabel,
      program: `Submitted audio (${basename(filePath)})`,
      sourceUrl,
    });
    if (scenes.length === 0) return [];
    // All scenes go into evidence items so the video review is complete.
    // Low-quality scenes carry a flag so resilience analysis can skip or down-weight them.
    return scenes.map((scene) => ({
      date,
      source_type: 'audio',
      source_label: sourceLabel,
      source_url: scene.url || sourceUrl,
      title: scene.title,
      body: scene.body,
      quality: scene.quality ?? 'medium',
      published_at: date,
    }));
  }
}
