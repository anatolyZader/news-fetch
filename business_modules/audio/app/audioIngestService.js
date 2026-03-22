/**
 * Orchestrates: audio file → transcription → articles-homefront-compatible markdown.
 */

import { statSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { tmpdir } from 'os';
import { join, basename, dirname } from 'path';

import { calcTranscriptionCostUsd } from '../../../cross-cut-modules/budget/app/budgetCostTracker.js';
import {
  OPENAI_TRANSCRIBE_DIARIZE_MODEL,
  OPENAI_WHISPER_MODEL,
} from '../infrastructure/adapters/openaiTranscriptionAdapter.js';

/** OpenAI transcription upload limit */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Stay under API limit */
export const SAFE_MAX_BYTES = 24 * 1024 * 1024;

/** Match mdReportsLoader body cap */
export const TARGET_CHUNK_CHARS = 1900;
/** Max time window per "article" block (seconds) */
export const MAX_WINDOW_SEC = 600;

function escapeMdHeading(s) {
  return String(s).replace(/#/g, '\\#').replace(/\n/g, ' ');
}

function formatClock(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '??:??';
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/**
 * @param {string} filePath
 * @returns {number|null} duration in seconds
 */
export function ffprobeDuration(filePath) {
  try {
    const out = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    );
    const d = parseFloat(out.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

/**
 * Split audio into parts each under SAFE_MAX_BYTES (best effort using duration-based slicing).
 * @returns {string[]} list of file paths (original, or temp parts)
 */
export function splitAudioFileIfNeeded(inputPath, safeMaxBytes = SAFE_MAX_BYTES) {
  const size = statSync(inputPath).size;
  if (size <= safeMaxBytes) return [inputPath];

  const duration = ffprobeDuration(inputPath);
  if (duration == null || duration <= 0) {
    throw new Error(
      `Audio file is ${(size / 1024 / 1024).toFixed(1)}MB (over ${safeMaxBytes / 1024 / 1024}MB safe limit). ` +
        'Install ffmpeg/ffprobe and ensure the file has a readable duration, or split the file manually.',
    );
  }

  const tmp = mkdtempSync(join(tmpdir(), 'audio-ingest-'));
  let numParts = Math.max(2, Math.ceil(size / safeMaxBytes));
  let parts = [];

  for (let attempt = 0; attempt < 5; attempt++) {
    for (const p of parts) {
      try {
        if (p.startsWith(tmp)) unlinkSync(p);
      } catch {
        /* ignore */
      }
    }
    parts = [];
    const partDur = duration / numParts;
    for (let i = 0; i < numParts; i++) {
      const out = join(tmp, `part_${i}.mp3`);
      const ss = i * partDur;
      execFileSync(
        'ffmpeg',
        ['-y', '-ss', String(ss), '-i', inputPath, '-t', String(partDur), '-vn', '-acodec', 'libmp3lame', '-q:a', '4', out],
        { stdio: 'ignore' },
      );
      if (!statSync(out).size) {
        throw new Error(`ffmpeg produced empty segment ${i}; check ffmpeg install and input format.`);
      }
      parts.push(out);
    }
    if (parts.every((p) => statSync(p).size <= safeMaxBytes)) break;
    numParts *= 2;
  }

  const stillLarge = parts.filter((p) => statSync(p).size > safeMaxBytes);
  if (stillLarge.length > 0) {
    throw new Error(
      `After splitting, ${stillLarge.length} part(s) still exceed ${safeMaxBytes} bytes. ` +
        'Try a lower-bitrate export or shorter source file.',
    );
  }

  return parts;
}

/**
 * Merge diarized segments into article-sized chunks (char + time window).
 * @param {Array<{ speaker: string, text: string, start?: number, end?: number }>} segments
 * @param {{ station: string, program: string }} meta
 */
export function groupSegmentsIntoArticles(segments, meta) {
  const { station, program } = meta;
  const articles = [];
  let buf = [];
  let bufChars = 0;
  let windowStart = segments[0]?.start ?? 0;
  let blockIndex = 0;

  const flush = () => {
    if (buf.length === 0) return;
    const first = buf[0];
    const last = buf[buf.length - 1];
    const t0 = first.tStart ?? windowStart;
    const t1 = last.tEnd ?? last.tStart ?? t0;
    const body = buf.map((b) => `${b.speaker}: ${b.text}`).join('\n\n');
    blockIndex += 1;
    articles.push({
      title: `${station} — ${program} — [${formatClock(t0)}–${formatClock(t1)}] — block ${blockIndex}`,
      body,
      tStart: t0,
      tEnd: t1,
    });
    buf = [];
    bufChars = 0;
  };

  for (const seg of segments) {
    const line = `${seg.speaker}: ${seg.text}`;
    const tStart = seg.start ?? seg.end ?? 0;
    const tEnd = seg.end ?? seg.start ?? 0;
    const piece = { speaker: seg.speaker, text: seg.text, tStart, tEnd };

    const wouldExceedChars = bufChars + line.length + 2 > TARGET_CHUNK_CHARS && buf.length > 0;
    const wouldExceedTime =
      buf.length > 0 &&
      tStart - windowStart > MAX_WINDOW_SEC;

    if (wouldExceedChars || wouldExceedTime) {
      flush();
      windowStart = tStart;
    }

    buf.push(piece);
    bufChars += line.length + 2;

    if (bufChars >= TARGET_CHUNK_CHARS) {
      flush();
      windowStart = tEnd;
    }
  }
  flush();

  return articles;
}

/**
 * @param {object} opts
 * @param {import('../infrastructure/adapters/openaiTranscriptionAdapter.js').OpenaiTranscriptionAdapter} opts.adapter  Transcription implementation (swap for other IAudioTranscriptionPort-style adapters)
 */
export class AudioIngestService {
  constructor({ adapter }) {
    this.adapter = adapter;
  }

  /**
   * Transcribe one audio file and write markdown for resilience analysis.
   * @param {object} p
   * @param {string} p.filePath
   * @param {string} p.date YYYY-MM-DD
   * @param {string} p.station
   * @param {string} p.program
   * @param {string} [p.publishedAt]
   * @param {string} [p.outPath]
   * @param {boolean} [p.useWhisper]  If true, use whisper-1 (no diarization).
   * @param {string[]} [p.knownSpeakerNames]
   * @param {string[]} [p.knownSpeakerReferences]  data URLs or paths handled by caller
   * @param {(e: { label: string, model: string, costUsd: number }) => void} [p.onUsage]  Budget meter (audio duration estimate)
   */
  async ingestToMarkdown(p) {
    const {
      filePath,
      date,
      station,
      program,
      publishedAt = date,
      outPath = 'articles-audio.md',
      useWhisper = false,
      knownSpeakerNames,
      knownSpeakerReferences,
      onUsage,
    } = p;

    const parts = splitAudioFileIfNeeded(filePath);
    const isTemp = parts.some((pt) => pt !== filePath);
    let timeOffset = 0;
    const allSegments = [];

    try {
      for (const part of parts) {
        const result = useWhisper
          ? await this.adapter.transcribeWhisperPlain({ filePath: part })
          : await this.adapter.transcribeDiarized({
              filePath: part,
              knownSpeakerNames,
              knownSpeakerReferences,
            });

        const dur = ffprobeDuration(part) ?? 0;
        const modelId = useWhisper ? OPENAI_WHISPER_MODEL : OPENAI_TRANSCRIBE_DIARIZE_MODEL;
        if (onUsage) {
          onUsage({
            label: `Audio ${useWhisper ? 'whisper' : 'diarize'} ${basename(part)}`,
            model: modelId,
            costUsd: calcTranscriptionCostUsd(modelId, dur),
          });
        }
        for (const seg of result.segments) {
          allSegments.push({
            speaker: seg.speaker,
            text: seg.text,
            start: seg.start != null ? seg.start + timeOffset : undefined,
            end: seg.end != null ? seg.end + timeOffset : undefined,
          });
        }
        timeOffset += dur;
      }
    } finally {
      if (isTemp && parts[0]?.includes('audio-ingest-')) {
        const dir = dirname(parts[0]);
        for (const part of parts) {
          try {
            unlinkSync(part);
          } catch {
            /* ignore */
          }
        }
        try {
          rmdirSync(dir);
        } catch {
          /* ignore */
        }
      }
    }

    const grouped = groupSegmentsIntoArticles(allSegments, { station, program });
    if (grouped.length === 0) {
      throw new Error('No transcript segments produced. Check audio content and API response.');
    }

    const md = buildAudioMarkdownDocument({
      date,
      station,
      program,
      publishedAt,
      introLine:
        'For population-behavior / Home Front resilience analysis (transcribed spoken audio: broadcast, podcast, video, interview, voice memo, etc.).',
      sourceFileLine: `Source file: ${basename(filePath)}`,
      urlLine: '- **URL:** (audio recording)',
      grouped,
    });

    writeFileSync(outPath, md, 'utf8');
    return { outPath, segmentCount: allSegments.length, articleBlocks: grouped.length };
  }

  /**
   * Write markdown from precomputed segments (e.g. YouTube captions) without calling speech-to-text.
   * @param {object} p
   * @param {Array<{ speaker: string, text: string, start?: number, end?: number }>} p.segments
   * @param {string} p.date
   * @param {string} p.station
   * @param {string} p.program
   * @param {string} [p.publishedAt]
   * @param {string} [p.outPath]
   * @param {string} [p.sourceUrl]  Canonical page URL for the video (shown in markdown)
   * @param {string} [p.transcriptSourceLabel]  e.g. "YouTube captions (yt-dlp)" or "YouTube captions (Data API)"
   */
  ingestTranscriptOnlyToMarkdown(p) {
    const {
      segments,
      date,
      station,
      program,
      publishedAt = date,
      outPath = 'articles-audio.md',
      sourceUrl,
      transcriptSourceLabel = 'YouTube captions',
    } = p;

    const grouped = groupSegmentsIntoArticles(segments, { station, program });
    if (grouped.length === 0) {
      throw new Error('No transcript segments to write.');
    }

    const intro =
      `For population-behavior / Home Front resilience analysis (${transcriptSourceLabel}; ` +
      `use alongside speech-to-text when captions are unavailable or incomplete).`;

    const md = buildAudioMarkdownDocument({
      date,
      station,
      program,
      publishedAt,
      introLine: intro,
      sourceFileLine: sourceUrl ? `Source: ${sourceUrl}` : 'Source: (video)',
      urlLine: sourceUrl ? `- **URL:** ${sourceUrl}` : '- **URL:** (video)',
      grouped,
    });

    writeFileSync(outPath, md, 'utf8');
    return { outPath, segmentCount: segments.length, articleBlocks: grouped.length };
  }
}

/**
 * @param {object} opts
 * @param {string} opts.date
 * @param {string} opts.station
 * @param {string} opts.program
 * @param {string} opts.publishedAt
 * @param {string} opts.introLine
 * @param {string} opts.sourceFileLine
 * @param {string} opts.urlLine
 * @param {Array<{ title: string, body: string }>} opts.grouped
 */
export function buildAudioMarkdownDocument(opts) {
  const { date, introLine, sourceFileLine, urlLine, publishedAt, station, program, grouped, perArticleUrl = false } = opts;

  const lines = [`# Audio recordings (${date})`, '', introLine, sourceFileLine, ''];

  grouped.forEach((a, i) => {
    const articleUrl = perArticleUrl && a.url ? `- **URL:** ${a.url}` : urlLine;
    lines.push(`## ${i + 1}. ${escapeMdHeading(a.title)}`);
    lines.push('');
    lines.push(articleUrl);
    lines.push(`- **Published:** ${publishedAt}`);
    lines.push(`- **Source:** ${station} — ${program}`);
    lines.push('');
    lines.push(a.body);
    lines.push('');
    lines.push('---');
    lines.push('');
  });

  return lines.join('\n');
}
