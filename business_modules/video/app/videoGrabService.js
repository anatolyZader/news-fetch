import { validateRemoteVideoUrl } from '../domain/services/remoteVideoUrlValidation.js';

/**
 * Orchestrates remote URL grabs (yt-dlp) and local sandbox file resolution.
 */
export class VideoGrabService {
  /**
   * @param {object} deps
   * @param {{ downloadAsMp3: (o: { url: string, outputDir: string }) => Promise<object> }} deps.remoteFetchPort
   * @param {{ resolveLocalPath: (p: string) => Promise<object> }} deps.localFilePort
   */
  constructor(deps) {
    if (!deps?.remoteFetchPort?.downloadAsMp3) {
      throw new Error('VideoGrabService requires remoteFetchPort.downloadAsMp3');
    }
    if (!deps?.localFilePort?.resolveLocalPath) {
      throw new Error('VideoGrabService requires localFilePort.resolveLocalPath');
    }
    this.remoteFetchPort = deps.remoteFetchPort;
    this.localFilePort = deps.localFilePort;
  }

  /**
   * @param {string} url
   * @param {string} outputDir  Absolute directory for yt-dlp output
   */
  async downloadFromUrl(url, outputDir) {
    const safeUrl = validateRemoteVideoUrl(url);
    return this.remoteFetchPort.downloadAsMp3({ url: safeUrl, outputDir });
  }

  /**
   * @param {string} relativePath  Path under video input sandbox (see localVideoFileAdapter)
   */
  async resolveLocalVideo(relativePath) {
    return this.localFilePort.resolveLocalPath(relativePath);
  }
}
