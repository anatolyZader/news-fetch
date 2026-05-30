#!/usr/bin/env node
/**
 * YouTube URL → articles-audio.md using YouTube captions when available (yt-dlp, then optional
 * YouTube Data API v3 via googleapis when OAuth env is set). Optionally falls back to or
 * supplements with OpenAI speech-to-text on downloaded MP3.
 *
 * Usage:
 *   node business_modules/video/input/youtube-to-md.js --url <youtube-url> --date YYYY-MM-DD --station "..." --program "..."
 *
 * Env:
 *   OPENAI_API_KEY — required for --fallback-audio or --also-transcribe-audio
 *   Optional OAuth (captions via API): YOUTUBE_OAUTH_CLIENT_ID, YOUTUBE_OAUTH_CLIENT_SECRET, YOUTUBE_OAUTH_REFRESH_TOKEN
 */
import 'dotenv/config';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createSourceArchive } from '../../../cross-cut-modules/source_archive/createSourceArchive.js';
import { persistOriginalSources } from '../../../cross-cut-modules/source_archive/persistOriginals.js';

import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';
import { OpenaiTranscriptionAdapter } from '../../audio/infrastructure/adapters/openaiTranscriptionAdapter.js';
import { AudioEvidenceIngestService } from '../../audio/app/audioEvidenceIngestService.js';
import { AudioIngestService, buildAudioMarkdownDocument } from '../../audio/app/audioIngestService.js';
import { contextualizeTranscript } from '../../audio/app/audioTranscriptContextualizer.js';
import { createYtDlpYoutubeAdapter } from '../infrastructure/adapters/ytDlpYoutubeAdapter.js';
import { createYoutubeDataApiCaptionsAdapter } from '../infrastructure/adapters/youtubeDataApiCaptionsAdapter.js';
import { YoutubeEvidenceIngestService } from '../app/youtubeEvidenceIngestService.js';
import { YoutubeTranscriptService } from '../app/youtubeTranscriptService.js';
import { VideoGrabService } from '../app/videoGrabService.js';
import { createLocalVideoFileAdapter } from '../infrastructure/adapters/localVideoFileAdapter.js';

const args = process.argv.slice(2);
const getArg = (flag, def = null) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] ?? def : def;
};
const hasFlag = (flag) => args.includes(flag);

function usage() {
  console.error(
    'Usage: node business_modules/video/input/youtube-to-md.js --url <youtube-url> --date YYYY-MM-DD --station <name> --program <name> [--out articles-audio.md] [--published YYYY-MM-DD] [--fallback-audio] [--also-transcribe-audio] [--whisper] [--contextualize]',
  );
  process.exit(1);
}

function transcriptSourceLabel(source) {
  if (source === 'youtube-data-api') return 'YouTube captions (Data API)';
  if (source === 'yt-dlp') return 'YouTube captions (yt-dlp)';
  return 'YouTube captions';
}

/** @param {string} md */
function stripLeadingAudioMarkdownIntro(md) {
  const m = /\n## /.exec(md);
  if (!m || m.index == null) return md.trim();
  return md.slice(m.index + 1).trim();
}

const url = getArg('--url');
const date = getArg('--date');
const station = getArg('--station');
const program = getArg('--program');
if (!url || !date || !station || !program) usage();

const publishedAt = getArg('--published', date);
const outPath = resolve(getArg('--out', 'articles-audio.md'));
const fallbackAudio = hasFlag('--fallback-audio');
const alsoTranscribe = hasFlag('--also-transcribe-audio');
const useWhisper = hasFlag('--whisper');
const contextualize = hasFlag('--contextualize');

if ((fallbackAudio || alsoTranscribe) && !process.env.OPENAI_API_KEY?.trim()) {
  console.error('OPENAI_API_KEY is required for --fallback-audio or --also-transcribe-audio');
  process.exit(1);
}

checkDailyBudget();
const { onUsage, getTotal, printSummary } = createCostTracker({ label: 'youtube-to-md' });

const ytDlp = createYtDlpYoutubeAdapter();
const dataApi = createYoutubeDataApiCaptionsAdapter();
const transcriptSvc = new YoutubeTranscriptService({
  remoteFetchPort: ytDlp,
  dataApiCaptions: dataApi,
});

const tmpSubs = mkdtempSync(join(tmpdir(), 'yt-subs-'));

try {
  const tr = await transcriptSvc.fetchTranscriptSegments({
    url,
    outputDir: tmpSubs,
  });

  const adapter = new OpenaiTranscriptionAdapter();
  const audioIngest = new AudioIngestService({ adapter });
  const audioEvidenceIngest = new AudioEvidenceIngestService({
    audioDownloadPort: {
      async downloadToTempFile() {
        throw new Error('youtube-to-md downloads YouTube audio through the video module');
      },
    },
    transcriptionPort: adapter,
    contextualizer: contextualizeTranscript,
  });
  const videoGrab = new VideoGrabService({
    remoteFetchPort: ytDlp,
    localFilePort: createLocalVideoFileAdapter(),
  });
  const youtubeEvidenceIngest = new YoutubeEvidenceIngestService({
    transcriptService: transcriptSvc,
    videoGrabService: videoGrab,
    audioEvidenceIngestService: audioEvidenceIngest,
    contextualizeTranscript,
  });

  let captionMd = '';
  if (tr.segments.length > 0) {
    const r = audioIngest.ingestTranscriptOnlyToMarkdown({
      segments: tr.segments,
      date,
      station,
      program,
      publishedAt,
      outPath: join(tmpSubs, 'captions-only.md'),
      sourceUrl: url.trim(),
      transcriptSourceLabel: transcriptSourceLabel(tr.source),
    });
    captionMd = readFileSync(r.outPath, 'utf8');
    console.error(
      `YouTube transcript: ${r.segmentCount} segment(s), ${r.articleBlocks} block(s) — source: ${tr.source}`,
    );
  } else {
    console.error(
      `No usable YouTube captions.${tr.ytDlpError ? ` yt-dlp: ${tr.ytDlpError}` : ''}${
        tr.dataApiError ? ` Data API: ${tr.dataApiError}` : ''
      }`,
    );
  }

  // ── Contextualize path: get raw segments → scene articles ──────────────────
  if (contextualize) {
    const result = await youtubeEvidenceIngest.ingestYoutubeUrlToEvidenceItems({
      url: url.trim(),
      date,
      outputDir: tmpSubs,
      station,
      program,
      sourceLabel: `${station} — ${program}`,
      publishedAt,
      transcriptResult: tr,
      onUsage,
    });
    const articles = result.items.map((item) => ({
      title: item.title,
      body: item.body,
      url: item.source_url,
    }));

    if (articles.length === 0) {
      console.error('Contextualization produced no usable scenes.');
      process.exit(1);
    }
    console.error(
      `YouTube contextualized ${articles.length} scene(s) via ${result.source}${
        result.transcriptSource ? ` (${result.transcriptSource})` : ''
      }`,
    );

    const md = buildAudioMarkdownDocument({
      date,
      station,
      program,
      publishedAt,
      introLine:
        'For population-behavior / Home Front resilience analysis (scene-contextualized audio transcript, English).',
      sourceFileLine: `Source: ${url}`,
      urlLine: `- **URL:** ${url}`,
      grouped: articles,
      perArticleUrl: true,
    });

    writeFileSync(outPath, md, 'utf8');
    console.error(`Contextualized ${articles.length} scene(s) → ${outPath}`);

    // Persist to DB
    try {
      const sqlitePath = resolve(process.cwd(), process.env.SQLITE_PATH?.trim() || 'db/app.sqlite');
      const archive = createSourceArchive(sqlitePath);
      const { archived } = persistOriginalSources(archive, result.items);
      archive.close();
      console.error(`  → ${archived} scene(s) archived`);
    } catch (err) {
      console.error(`  ⚠ DB write failed (continuing): ${err.message}`);
    }

  } else {
    // ── Standard path ─────────────────────────────────────────────────────────
    const needAudio = (fallbackAudio && tr.segments.length === 0) || alsoTranscribe;

    let asrMd = '';
    if (needAudio) {
      const dl = await videoGrab.downloadFromUrl(url, tmpSubs);
      if (dl.ok) {
        const asrResult = await audioIngest.ingestToMarkdown({
          filePath: dl.outputPath,
          date,
          station,
          program,
          publishedAt,
          outPath: join(tmpSubs, 'asr.md'),
          useWhisper,
          onUsage,
        });
        asrMd = readFileSync(asrResult.outPath, 'utf8');
        console.error(
          `Speech-to-text: ${asrResult.segmentCount} segment(s), ${asrResult.articleBlocks} block(s) (OpenAI)`,
        );
      } else {
        console.error('Audio download failed:', dl.error);
        if (dl.stderr) console.error(dl.stderr.slice(0, 2000));
        if (tr.segments.length === 0) process.exit(1);
      }
    }

    if (captionMd && asrMd) {
      const asrBody = stripLeadingAudioMarkdownIntro(asrMd);
      const combined =
        captionMd.trim() +
        '\n\n---\n\n# Supplement: speech-to-text (OpenAI)\n\n' +
        'When captions were missing or you requested both, this section is machine transcription of the audio track.\n\n' +
        asrBody;
      writeFileSync(outPath, combined, 'utf8');
    } else if (captionMd) {
      writeFileSync(outPath, captionMd, 'utf8');
    } else if (asrMd) {
      writeFileSync(outPath, asrMd, 'utf8');
    } else {
      console.error('No transcript and no audio transcription produced. Use --fallback-audio to transcribe when captions are missing.');
      process.exit(1);
    }
  } // end standard path

  printSummary();
  const { totalCostUsd, usageLog } = getTotal();
  appendCostLog({
    script: 'youtube-to-md',
    date,
    totalCostUsd,
    usageLog,
    articles: 1,
  });
  console.error(`Wrote → ${outPath}`);
} finally {
  try {
    rmSync(tmpSubs, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}
