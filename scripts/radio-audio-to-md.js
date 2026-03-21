#!/usr/bin/env node
/**
 * Transcribe radio audio → articles-radio.md (Home Front resilience pipeline input).
 *
 * Usage:
 *   node scripts/radio-audio-to-md.js --input <file.mp3> --date YYYY-MM-DD --station "KAN" --program "Morning"
 *
 * Env: OPENAI_API_KEY (required). Optional: ffmpeg/ffprobe on PATH if file > 24MB.
 *
 * Flags:
 *   --input       Path to audio (mp3, m4a, wav, webm, mp4, mpeg, mpga)
 *   --date        Broadcast date YYYY-MM-DD
 *   --station     Station label (e.g. KAN, Galatz)
 *   --program     Program name
 *   --published   Optional published string (default: --date)
 *   --out         Output markdown path (default: articles-radio.md)
 *   --whisper     Use whisper-1 only (no speaker diarization)
 */

import 'dotenv/config';
import { resolve } from 'path';

import { OpenaiTranscriptionAdapter } from '../business_modules/radio/infrastructure/adapters/openaiTranscriptionAdapter.js';
import { RadioIngestService } from '../business_modules/radio/app/radioIngestService.js';

const args = process.argv.slice(2);
const getArg = (flag, def = null) => {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] ?? def : def;
};
const hasFlag = (flag) => args.includes(flag);

function usage() {
  console.error(`Usage: node scripts/radio-audio-to-md.js --input <audio> --date YYYY-MM-DD --station <name> --program <name> [--out articles-radio.md] [--whisper]`);
  process.exit(1);
}

const input = getArg('--input');
const date = getArg('--date');
const station = getArg('--station');
const program = getArg('--program');
if (!input || !date || !station || !program) usage();

const publishedAt = getArg('--published', date);
const outPath = resolve(getArg('--out', 'articles-radio.md'));
const useWhisper = hasFlag('--whisper');

const adapter = new OpenaiTranscriptionAdapter();
const service = new RadioIngestService({ adapter });

try {
  const result = await service.ingestToMarkdown({
    filePath: resolve(input),
    date,
    station,
    program,
    publishedAt,
    outPath,
    useWhisper,
  });
  console.error(`Wrote ${result.articleBlocks} transcript block(s) (${result.segmentCount} segments) → ${result.outPath}`);
} catch (err) {
  console.error('radio-audio-to-md failed:', err.message);
  process.exit(1);
}
