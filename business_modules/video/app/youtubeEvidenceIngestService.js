/**
 * Shared YouTube evidence ingest: captions first, audio transcription fallback.
 *
 * Dependencies are injected so this video module does not import audio module internals directly.
 */
import { copyFile, mkdir, unlink } from 'node:fs/promises';
import { basename, join } from 'node:path';

async function retainDownloadedAudio(outputPath, outputDir) {
  const retainedDir = join(outputDir, 'retained');
  const retainedPath = join(retainedDir, basename(outputPath));
  await mkdir(retainedDir, { recursive: true });
  await copyFile(outputPath, retainedPath);
  return retainedPath;
}

export class YoutubeEvidenceIngestService {
  /**
   * @param {object} deps
   * @param {{ fetchTranscriptSegments: (o: { url: string, outputDir: string }) => Promise<object> }} deps.transcriptService
   * @param {{ downloadFromUrl: (url: string, outputDir: string) => Promise<object> }} deps.videoGrabService
   * @param {{ ingestAudioFileToEvidenceItems: Function }} deps.audioEvidenceIngestService
   * @param {(segments: Array, opts: object) => Promise<Array>} deps.contextualizeTranscript
   */
  constructor({ transcriptService, videoGrabService, audioEvidenceIngestService, contextualizeTranscript }) {
    if (!transcriptService?.fetchTranscriptSegments) {
      throw new Error('YoutubeEvidenceIngestService requires transcriptService.fetchTranscriptSegments');
    }
    if (!videoGrabService?.downloadFromUrl) {
      throw new Error('YoutubeEvidenceIngestService requires videoGrabService.downloadFromUrl');
    }
    if (!audioEvidenceIngestService?.ingestAudioFileToEvidenceItems) {
      throw new Error('YoutubeEvidenceIngestService requires audioEvidenceIngestService.ingestAudioFileToEvidenceItems');
    }
    if (typeof contextualizeTranscript !== 'function') {
      throw new Error('YoutubeEvidenceIngestService requires contextualizeTranscript');
    }
    this.transcriptService = transcriptService;
    this.videoGrabService = videoGrabService;
    this.audioEvidenceIngestService = audioEvidenceIngestService;
    this.contextualizeTranscript = contextualizeTranscript;
  }

  /**
   * @param {{ url: string, date: string, outputDir: string, station?: string, program?: string, sourceLabel?: string, publishedAt?: string, transcriptResult?: object, onUsage?: Function }} args
   * @returns {Promise<{ items: Array, source: 'captions'|'audio-fallback', transcriptSource?: string, errors: string[] }>}
   */
  async ingestYoutubeUrlToEvidenceItems({
    url,
    date,
    outputDir,
    station = 'youtube',
    program = 'Submitted YouTube video',
    sourceLabel = 'youtube',
    publishedAt = date,
    transcriptResult,
    onUsage,
  }) {
    const errors = [];
    const transcript = transcriptResult ?? (await this.transcriptService.fetchTranscriptSegments({ url, outputDir }));
    if (transcript.segments?.length > 0) {
      const scenes = await this.contextualizeTranscript(transcript.segments, {
        station,
        program,
        sourceUrl: url,
        onUsage,
      });
      const items = scenes.map((scene) => ({
        date,
        source_type: 'audio',
        source_label: sourceLabel,
        source_url: scene.url || url,
        title: scene.title,
        body: scene.body,
        quality: scene.quality ?? 'medium',
        published_at: publishedAt,
      }));
      if (items.length > 0) {
        return { items, source: 'captions', transcriptSource: transcript.source, errors };
      }
      errors.push('captions contextualization produced no evidence items');
    } else {
      if (transcript.ytDlpError) errors.push(`yt-dlp captions: ${transcript.ytDlpError}`);
      if (transcript.dataApiError) errors.push(`YouTube Data API captions: ${transcript.dataApiError}`);
    }

    const download = await this.videoGrabService.downloadFromUrl(url, outputDir);
    if (!download?.ok || !download?.outputPath) {
      throw new Error(download?.error || errors.join(' | ') || 'YouTube audio fallback failed');
    }

    const retainedAudioPath = await retainDownloadedAudio(download.outputPath, outputDir);
    let items;
    try {
      items = await this.audioEvidenceIngestService.ingestAudioFileToEvidenceItems({
        filePath: retainedAudioPath,
        date,
        sourceUrl: url,
        sourceLabel,
      });
    } catch (err) {
      console.error('[evidence] youtube audio transcription failed; retained audio kept for retry', {
        retainedAudioPath,
        message: err?.message ?? 'unknown error',
      });
      throw err;
    }
    await unlink(retainedAudioPath).catch(() => {});
    return { items, source: 'audio-fallback', errors };
  }
}
