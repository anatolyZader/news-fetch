/**
 * OpenAI Audio API: gpt-4o-transcribe-diarize (speaker labels) or whisper-1 (no diarization).
 * Default adapter for business_modules/audio (implements IAudioTranscriptionPort behavior).
 */

import { createReadStream } from 'node:fs';
import OpenAI from 'openai';

const RETRY_DELAYS_MS = [10_000, 30_000, 60_000]; // 3 attempts after first failure
const DEFAULT_TRANSCRIPTION_TIMEOUT_MS = 180_000;

async function withRetry(fn, label) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const isTransient = err.code === 'ECONNRESET' ||
        err.message?.includes('ECONNRESET') ||
        err.message?.includes('Premature close') ||
        err.message?.includes('ETIMEDOUT') ||
        err.message?.includes('Connection error') ||
        err.message?.includes('connection') ||
        err.message?.includes('network') ||
        err.status === 429 ||
        err.status >= 500;
      if (!isTransient || attempt === RETRY_DELAYS_MS.length) throw err;
      const delay = RETRY_DELAYS_MS[attempt];
      console.error(`  ⚠ ${label} attempt ${attempt + 1} failed (${err.message}); retrying in ${delay / 1000}s…`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/** @public — must match keys in cross-cut-modules/budget TRANSCRIPTION_USD_PER_MINUTE */
export const OPENAI_TRANSCRIBE_DIARIZE_MODEL = 'gpt-4o-transcribe-diarize';
export const OPENAI_WHISPER_MODEL = 'whisper-1';

/**
 * Normalize diarized_json API response into { segments, fullText }.
 */
export function normalizeDiarizedResponse(raw) {
  const segments = [];
  const list = raw?.segments ?? raw?.chunks ?? [];
  for (const seg of list) {
    const text = (seg.text ?? seg.transcript ?? '').trim();
    if (!text) continue;
    segments.push({
      speaker: String(seg.speaker ?? seg.speaker_id ?? 'SPEAKER_UNKNOWN'),
      text,
      start: typeof seg.start === 'number' ? seg.start : undefined,
      end: typeof seg.end === 'number' ? seg.end : undefined,
    });
  }
  const fullText = segments.length
    ? segments.map((s) => `${s.speaker}: ${s.text}`).join('\n')
    : (raw?.text ?? '').trim();
  return { segments, fullText };
}

export class OpenaiTranscriptionAdapter {
  /**
   * @param {{ apiKey?: string, client?: import('openai').default }} deps
   */
  constructor(deps = {}) {
    const key = deps.apiKey ?? process.env.OPENAI_API_KEY?.trim();
    if (!key) {
      throw new Error('OPENAI_API_KEY is required for OpenaiTranscriptionAdapter');
    }
    this.timeoutMs = Number(process.env.OPENAI_TRANSCRIPTION_TIMEOUT_MS) || DEFAULT_TRANSCRIPTION_TIMEOUT_MS;
    this.client = deps.client ?? new OpenAI({ apiKey: key, timeout: this.timeoutMs });
  }

  /**
   * Transcribe with speaker diarization (recommended).
   * @param {{ filePath: string, knownSpeakerNames?: string[], knownSpeakerReferences?: string[] }} opts
   * @returns {Promise<TranscriptionResult>}
   */
  async transcribeDiarized(opts) {
    const { filePath, knownSpeakerNames, knownSpeakerReferences, language } = opts;
    /** @type {Record<string, unknown>} */
    const body = {
      file: createReadStream(filePath),
      model: OPENAI_TRANSCRIBE_DIARIZE_MODEL,
      response_format: 'diarized_json',
      chunking_strategy: 'auto',
    };
    if (language) body.language = language;
    if (knownSpeakerNames?.length && knownSpeakerReferences?.length) {
      body.extra_body = {
        known_speaker_names: knownSpeakerNames,
        known_speaker_references: knownSpeakerReferences,
      };
    }
    const raw = await withRetry(() => this.client.audio.transcriptions.create(body), `transcribeDiarized ${filePath}`);
    return normalizeDiarizedResponse(raw);
  }

  /**
   * Plain Whisper — no speaker labels; single segment.
   * @param {{ filePath: string }} opts
   * @returns {Promise<TranscriptionResult>}
   */
  async transcribeWhisperPlain(opts) {
    const { filePath, language } = opts;
    const body = {
      file: createReadStream(filePath),
      model: OPENAI_WHISPER_MODEL,
      response_format: 'json',
    };
    if (language) body.language = language;
    const raw = await withRetry(() => this.client.audio.transcriptions.create(body), `transcribeWhisperPlain ${filePath}`);
    const text = (raw.text ?? '').trim();
    return {
      segments: text ? [{ speaker: 'TRANSCRIPT', text, start: undefined, end: undefined }] : [],
      fullText: text,
    };
  }
}
