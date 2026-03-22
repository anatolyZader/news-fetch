#!/usr/bin/env node
/**
 * Transcribe MP3 audio → articles-audio.md (Home Front resilience pipeline input).
 * Source-agnostic: pass --station / --program (or future flags) to label the run; add adapters for URL/download flows later.
 *
 * Usage:
 *   node business_modules/audio/input/audio-to-md.js --input <file.mp3> --date YYYY-MM-DD --station "KAN" --program "Morning"
 *
 * Env: OPENAI_API_KEY (required). Optional: ffmpeg/ffprobe on PATH if file > 24MB.
 */
import 'dotenv/config';
import { resolve } from 'path';

import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';
import { OpenaiTranscriptionAdapter } from '../infrastructure/adapters/openaiTranscriptionAdapter.js';
import { AudioIngestService } from '../app/audioIngestService.js';

const args = process.argv.slice(2);
const getArg = (flag, def = null) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] ?? def : def;
};
const hasFlag = (flag) => args.includes(flag);

function usage() {
  console.error(
    'Usage: node business_modules/audio/input/audio-to-md.js --input <audio> --date YYYY-MM-DD --station <name> --program <name> [--out articles-audio.md] [--whisper]',
  );
  process.exit(1);
}

const input = getArg('--input');
const date = getArg('--date');
const station = getArg('--station');
const program = getArg('--program');
if (!input || !date || !station || !program) usage();

checkDailyBudget();
const { onUsage, getTotal, printSummary } = createCostTracker({ label: 'audio-to-md' });

const publishedAt = getArg('--published', date);
const outPath = resolve(getArg('--out', 'articles-audio.md'));
const useWhisper = hasFlag('--whisper');

const adapter = new OpenaiTranscriptionAdapter();
const service = new AudioIngestService({ adapter });

try {
  const result = await service.ingestToMarkdown({
    filePath: resolve(input),
    date,
    station,
    program,
    publishedAt,
    outPath,
    useWhisper,
    onUsage,
  });
  console.error(`Wrote ${result.articleBlocks} transcript block(s) (${result.segmentCount} segments) → ${result.outPath}`);
  printSummary();
  const { totalCostUsd, usageLog } = getTotal();
  appendCostLog({
    script: 'audio-to-md',
    date,
    totalCostUsd,
    usageLog,
    articles: result.articleBlocks,
  });
} catch (err) {
  console.error('audio-to-md failed:', err.message);
  process.exit(1);
}
