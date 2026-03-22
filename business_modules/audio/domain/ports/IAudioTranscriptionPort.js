/**
 * Port: transcribe audio (MP3) into diarized segments (speaker-labeled text).
 *
 * Implementations: OpenaiTranscriptionAdapter (gpt-4o-transcribe-diarize or whisper-1).
 * Additional source-specific adapters (podcast URL, video extract, etc.) implement this contract.
 *
 * @typedef {Object} DiarizedSegment
 * @property {string} speaker   Speaker id or label from the ASR system
 * @property {string} text      Transcribed text for this segment
 * @property {number} [start]   Start time in seconds (optional)
 * @property {number} [end]     End time in seconds (optional)
 */

/**
 * @typedef {Object} TranscriptionResult
 * @property {DiarizedSegment[]} segments
 * @property {string} [fullText]  Plain concatenation (optional)
 */

export const AUDIO_TRANSCRIPTION_PORT = Symbol('IAudioTranscriptionPort');
