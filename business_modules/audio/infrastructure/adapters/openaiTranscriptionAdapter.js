/**
 * OpenAI Audio API: gpt-4o-transcribe-diarize (speaker labels) or whisper-1 (no diarization).
 * Default adapter for business_modules/audio (implements IAudioTranscriptionPort behavior).
 */

import { createReadStream } from 'fs';
import OpenAI from 'openai';

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
    this.client = deps.client ?? new OpenAI({ apiKey: key });
  }

  /**
   * Transcribe with speaker diarization (recommended).
   * @param {{ filePath: string, knownSpeakerNames?: string[], knownSpeakerReferences?: string[] }} opts
   * @returns {Promise<TranscriptionResult>}
   */
  async transcribeDiarized(opts) {
    const { filePath, knownSpeakerNames, knownSpeakerReferences } = opts;
    /** @type {Record<string, unknown>} */
    const body = {
      file: createReadStream(filePath),
      model: OPENAI_TRANSCRIBE_DIARIZE_MODEL,
      response_format: 'diarized_json',
      chunking_strategy: 'auto',
    };
    if (knownSpeakerNames?.length && knownSpeakerReferences?.length) {
      body.extra_body = {
        known_speaker_names: knownSpeakerNames,
        known_speaker_references: knownSpeakerReferences,
      };
    }
    const raw = await this.client.audio.transcriptions.create(body);
    return normalizeDiarizedResponse(raw);
  }

  /**
   * Plain Whisper — no speaker labels; single segment.
   * @param {{ filePath: string }} opts
   * @returns {Promise<TranscriptionResult>}
   */
  async transcribeWhisperPlain(opts) {
    const { filePath } = opts;
    const raw = await this.client.audio.transcriptions.create({
      file: createReadStream(filePath),
      model: OPENAI_WHISPER_MODEL,
      response_format: 'json',
    });
    const text = (raw.text ?? '').trim();
    return {
      segments: text ? [{ speaker: 'TRANSCRIPT', text, start: undefined, end: undefined }] : [],
      fullText: text,
    };
  }
}
