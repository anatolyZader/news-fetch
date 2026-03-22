/**
 * Video module — remote URL grab (yt-dlp) and local file resolution.
 */
export { VideoGrabService } from './app/videoGrabService.js';
export { createYtDlpYoutubeAdapter } from './infrastructure/adapters/ytDlpYoutubeAdapter.js';
export { createLocalVideoFileAdapter } from './infrastructure/adapters/localVideoFileAdapter.js';
export { validateRemoteVideoUrl } from './domain/services/remoteVideoUrlValidation.js';
