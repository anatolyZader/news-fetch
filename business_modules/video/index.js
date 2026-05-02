/**
 * Video module — remote URL grab (yt-dlp) and local file resolution.
 */
export { VideoGrabService } from './app/videoGrabService.js';
export { YoutubeTranscriptService } from './app/youtubeTranscriptService.js';
export { YoutubeEvidenceIngestService } from './app/youtubeEvidenceIngestService.js';
export { createYtDlpYoutubeAdapter } from './infrastructure/adapters/ytDlpYoutubeAdapter.js';
export { createYoutubeDataApiCaptionsAdapter } from './infrastructure/adapters/youtubeDataApiCaptionsAdapter.js';
export { extractYoutubeVideoId } from './domain/services/youtubeVideoId.js';
export { parseWebVttToSegments } from './domain/services/parseWebVtt.js';
export { createLocalVideoFileAdapter } from './infrastructure/adapters/localVideoFileAdapter.js';
export { validateRemoteVideoUrl } from './domain/services/remoteVideoUrlValidation.js';
