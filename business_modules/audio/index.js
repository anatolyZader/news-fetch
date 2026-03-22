/**
 * Audio ingestion module — MP3 from any source (broadcast, podcast, video rip, voice memo, interview).
 * Re-exports for composition / tests. Future: additional adapters (e.g. yt-dlp, voice-message parsers).
 */
export { AudioIngestService } from './app/audioIngestService.js';
export { OpenaiTranscriptionAdapter, normalizeDiarizedResponse } from './infrastructure/adapters/openaiTranscriptionAdapter.js';
