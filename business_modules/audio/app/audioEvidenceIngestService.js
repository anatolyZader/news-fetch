import { basename, join, resolve } from 'node:path';
import { unlinkSync, rmdirSync, mkdirSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { AudioIngestService } from './audioIngestService.js';
import { contextualizeTranscript as defaultContextualizer } from './audioTranscriptContextualizer.js';

const APP_TEMP_ROOT = resolve(process.cwd(), 'db', '.tmp');

function ensureAppTempRoot() {
  mkdirSync(APP_TEMP_ROOT, { recursive: true });
}

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
    if (dir.includes('audio-evidence-') || dir.includes('audio-url-')) rmdirSync(dir);
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

function parseAudioMarkdownEvidenceItems(markdown, { date, sourceUrl, sourceLabel }) {
  const sections = String(markdown ?? '').split(/\n##\s+\d+\.\s+/).slice(1);
  return sections
    .map((section) => {
      const [rawTitle = '', ...rest] = section.split('\n');
      const body = rest
        .join('\n')
        .replaceAll(/^- \*\*(URL|Published|Source):\*\*.*$/gm, '')
        .replaceAll(/^---$/gm, '')
        .trim();
      return {
        date,
        source_type: 'audio',
        source_label: sourceLabel,
        source_url: sourceUrl,
        title: rawTitle.trim() || `Submitted audio (${sourceLabel})`,
        body,
        quality: 'medium',
        published_at: date,
      };
    })
    .filter((item) => item.body.length > 0);
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
      return await this.ingestAudioFileToEvidenceItems({
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
    ensureAppTempRoot();
    const tmp = await mkdtemp(join(APP_TEMP_ROOT, 'audio-evidence-'));
    const outPath = join(tmp, 'articles-audio.md');
    try {
      await this.audioIngestService.ingestToMarkdown({
        filePath,
        date,
        station: sourceLabel,
        program: `Submitted audio (${basename(filePath)})`,
        publishedAt: date,
        outPath,
      });
      const markdown = await readFile(outPath, 'utf8');
      const items = parseAudioMarkdownEvidenceItems(markdown, { date, sourceUrl, sourceLabel });
      if (items.length > 0) return items;
      throw new Error('No evidence items produced from audio transcript markdown');
    } finally {
      await rm(tmp, { recursive: true, force: true }).catch(() => {});
    }
  }
}
