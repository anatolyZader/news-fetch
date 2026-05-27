/**
 * Orchestrates: audio file → transcription → articles-homefront-compatible markdown.
 */

import { statSync, writeFileSync, mkdtempSync, unlinkSync, rmdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, basename, dirname } from 'node:path';

import { calcTranscriptionCostUsd } from '../../../cross-cut-modules/budget/app/budgetCostTracker.js';
import {
  OPENAI_TRANSCRIBE_DIARIZE_MODEL,
  OPENAI_WHISPER_MODEL,
} from '../infrastructure/adapters/openaiTranscriptionAdapter.js';
import { contextualizeTranscript } from './audioTranscriptContextualizer.js';

const NON_NEWS_SCENE_TYPES = new Set(['advertisement', 'music', 'station_promo']);

/** OpenAI transcription upload limit */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
/** Stay under API limit */
export const SAFE_MAX_BYTES = 24 * 1024 * 1024;
/** OpenAI transcription model max duration per chunk (seconds) */
export const MAX_CHUNK_DURATION_SEC = 600; // 10-min chunks: small uploads, less exposure to connectivity drops

/** Match mdReportsLoader body cap */
export const TARGET_CHUNK_CHARS = 1900;
/** Max time window per "article" block (seconds) */
export const MAX_WINDOW_SEC = 600;

function escapeMdHeading(s) {
  return String(s).replaceAll('#', '\\#').replaceAll('\n', ' ');
}

function formatClock(seconds) {
  if (seconds == null || Number.isNaN(seconds)) return '??:??';
  const m = Math.floor(seconds / 60);
  const sec = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** Fixed PATH for ffmpeg/ffprobe — avoids untrusted PATH injection (Sonar S4036). */
const MEDIA_BIN_PATH = process.env.MEDIA_BIN_PATH ?? '/usr/local/bin:/usr/bin:/bin';

const MEDIA_EXEC_ENV = { ...process.env, PATH: MEDIA_BIN_PATH };

function execMediaCommand(bin, args, options = {}) {
  return execFileSync(bin, args, {
    env: MEDIA_EXEC_ENV,
    ...options,
  });
}

/**
 * @param {string} filePath
 * @returns {number|null} duration in seconds
 */
export function ffprobeDuration(filePath) {
  try {
    const out = execMediaCommand(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { encoding: 'utf8', maxBuffer: 1024 * 1024 },
    );
    const d = Number.parseFloat(out.trim());
    return Number.isFinite(d) ? d : null;
  } catch {
    return null;
  }
}

function cleanupSplitAttempt(parts, tmp) {
  for (const p of parts) {
    try { if (p.startsWith(tmp)) unlinkSync(p); } catch { /* ignore */ }
  }
}

function writeFfmpegSegment(inputPath, out, ss, partDur) {
  execMediaCommand(
    'ffmpeg',
    ['-y', '-i', inputPath, '-ss', String(ss), '-t', String(partDur), '-vn', '-acodec', 'libmp3lame', '-q:a', '4', out],
    { stdio: 'ignore' },
  );
}

function buildSplitParts(inputPath, duration, numParts, tmp) {
  const parts = [];
  const partDur = duration / numParts;
  for (let i = 0; i < numParts; i++) {
    const out = join(tmp, `part_${i}.mp3`);
    writeFfmpegSegment(inputPath, out, i * partDur, partDur);
    if (!statSync(out).size) {
      throw new Error(`ffmpeg produced empty segment ${i}; check ffmpeg install and input format.`);
    }
    parts.push(out);
  }
  return parts;
}

function partsWithinLimits(parts, safeMaxBytes, maxDurationSec) {
  const sizeOk = parts.every((p) => statSync(p).size <= safeMaxBytes);
  const durOk = parts.every((p) => (ffprobeDuration(p) ?? 0) <= maxDurationSec);
  return sizeOk && durOk;
}

/**
 * Split audio into parts satisfying both size and duration constraints.
 * Splits whenever a chunk would exceed SAFE_MAX_BYTES OR MAX_CHUNK_DURATION_SEC.
 * @returns {string[]} list of file paths (original, or temp parts)
 */
export function splitAudioFileIfNeeded(inputPath, safeMaxBytes = SAFE_MAX_BYTES, maxDurationSec = MAX_CHUNK_DURATION_SEC) {
  const size = statSync(inputPath).size;
  const duration = ffprobeDuration(inputPath);

  const needsSizeSplit = size > safeMaxBytes;
  const needsDurationSplit = duration != null && duration > maxDurationSec;

  if (!needsSizeSplit && !needsDurationSplit) return [inputPath];

  if (duration == null || duration <= 0) {
    throw new Error(
      `Audio file is ${(size / 1024 / 1024).toFixed(1)}MB (over ${safeMaxBytes / 1024 / 1024}MB safe limit). ` +
        'Install ffmpeg/ffprobe and ensure the file has a readable duration, or split the file manually.',
    );
  }

  const partsBySize = Math.ceil(size / safeMaxBytes);
  const partsByDuration = Math.ceil(duration / maxDurationSec);
  const tmp = mkdtempSync(join(tmpdir(), 'audio-ingest-'));
  let numParts = Math.max(2, partsBySize, partsByDuration);
  let parts = [];

  for (let attempt = 0; attempt < 5; attempt += 1) {
    cleanupSplitAttempt(parts, tmp);
    parts = buildSplitParts(inputPath, duration, numParts, tmp);
    if (partsWithinLimits(parts, safeMaxBytes, maxDurationSec)) break;
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

function cleanupTempParts(parts, filePath) {
  if (!parts.some((pt) => pt !== filePath)) return;
  if (!parts[0]?.includes('audio-ingest-')) return;
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

async function transcribeDiarizedWithFallback(adapter, part, language, knownSpeakerNames, knownSpeakerReferences) {
  try {
    const result = await adapter.transcribeDiarized({ filePath: part, language, knownSpeakerNames, knownSpeakerReferences });
    return { result, modelId: OPENAI_TRANSCRIBE_DIARIZE_MODEL };
  } catch (err) {
    if (err.status !== 400) throw err;
    console.warn(`[audio] Diarize failed on ${basename(part)} (${err.message}); retrying with whisper-1`);
    const result = await adapter.transcribeWhisperPlain({ filePath: part, language });
    return { result, modelId: OPENAI_WHISPER_MODEL };
  }
}

async function transcribePart(adapter, part, { useWhisper, language, knownSpeakerNames, knownSpeakerReferences }) {
  if (useWhisper) {
    const result = await adapter.transcribeWhisperPlain({ filePath: part, language });
    return { result, modelId: OPENAI_WHISPER_MODEL };
  }
  return transcribeDiarizedWithFallback(adapter, part, language, knownSpeakerNames, knownSpeakerReferences);
}

function appendSegmentsFromResult(allSegments, result, timeOffset) {
  for (const seg of result.segments) {
    allSegments.push({
      speaker: seg.speaker,
      text: seg.text,
      start: seg.start == null ? undefined : seg.start + timeOffset,
      end: seg.end == null ? undefined : seg.end + timeOffset,
    });
  }
}

async function transcribePartOrSkip(adapter, part, opts, timeOffset) {
  const dur = ffprobeDuration(part) ?? 0;
  try {
    const { result, modelId } = await transcribePart(adapter, part, opts);
    return { skipped: false, dur, result, modelId };
  } catch (err) {
    if (err.status === 400) {
      console.warn(`[audio] Skipping corrupted chunk ${basename(part)} at offset ${timeOffset}s (${err.message})`);
      return { skipped: true, dur, result: null, modelId: null };
    }
    throw err;
  }
}

/**
 * @param {object} p
 * @param {import('../infrastructure/adapters/openaiTranscriptionAdapter.js').OpenaiTranscriptionAdapter} p.adapter
 */
async function collectTranscriptSegments(p) {
  const {
    filePath,
    useWhisper = false,
    language,
    knownSpeakerNames,
    knownSpeakerReferences,
    onUsage,
    adapter,
  } = p;
  const parts = splitAudioFileIfNeeded(filePath);
  let timeOffset = 0;
  const allSegments = [];
  const transcribeOpts = { useWhisper, language, knownSpeakerNames, knownSpeakerReferences };

  try {
    for (const part of parts) {
      const outcome = await transcribePartOrSkip(adapter, part, transcribeOpts, timeOffset);
      timeOffset += outcome.dur;
      if (outcome.skipped) continue;

      if (onUsage) {
        onUsage({
          label: `Audio ${useWhisper ? 'whisper' : 'diarize'} ${basename(part)}`,
          model: outcome.modelId,
          costUsd: calcTranscriptionCostUsd(outcome.modelId, outcome.dur),
        });
      }
      appendSegmentsFromResult(allSegments, outcome.result, timeOffset - outcome.dur);
    }
  } finally {
    cleanupTempParts(parts, filePath);
  }

  return allSegments;
}

function groupTranscriptBlocks(allSegments, contextualize, station, program, onUsage) {
  if (contextualize) {
    return contextualizeTranscript(allSegments, { station, program, onUsage }).then((scenes) => {
      const grouped = scenes.filter(
        (s) => !NON_NEWS_SCENE_TYPES.has(s.scene_type) && s.quality !== 'low',
      );
      console.log(
        `[audio] contextualize: ${scenes.length} scene(s) total, ${grouped.length} kept after filtering non-news/low-quality`,
      );
      return grouped;
    });
  }
  return Promise.resolve(groupSegmentsIntoArticles(allSegments, { station, program }));
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
   * @param {boolean} [p.contextualize]  If true, run LLM scene segmentation and strip ads/music/promos.
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
      language,
      knownSpeakerNames,
      knownSpeakerReferences,
      onUsage,
      contextualize = false,
    } = p;

    const allSegments = await collectTranscriptSegments({
      filePath,
      useWhisper,
      language,
      knownSpeakerNames,
      knownSpeakerReferences,
      onUsage,
      adapter: this.adapter,
    });

    const grouped = await groupTranscriptBlocks(
      allSegments,
      contextualize,
      station,
      program,
      onUsage,
    );
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
    lines.push(`## ${i + 1}. ${escapeMdHeading(a.title)}`, '', articleUrl, `- **Published:** ${publishedAt}`, `- **Source:** ${station} — ${program}`, '', a.body, '', '---', '');
  });

  return lines.join('\n');
}
