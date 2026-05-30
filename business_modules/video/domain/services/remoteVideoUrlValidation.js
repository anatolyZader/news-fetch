/**
 * Strict validation for URLs passed to yt-dlp (reduces open redirects / obvious SSRF to internal hosts).
 * Delegates to shared cross-cut-modules/security SSRF guard.
 */

export {
  validateUserFetchUrl as validateRemoteVideoUrl,
  MAX_URL_LENGTH,
} from '../../../../cross-cut-modules/security/domain/services/ssrfGuard.js';
