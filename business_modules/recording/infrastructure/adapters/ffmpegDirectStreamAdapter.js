import { spawn } from 'child_process';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

/**
 * Records a direct HTTP/HLS/RTSP audio stream to a file using FFmpeg.
 *
 * The stream URL can be anything FFmpeg's -i accepts:
 *   - MP3 shoutcast:  http://...
 *   - HLS:            https://.../playlist.m3u8
 *   - RTSP:           rtsp://...
 *
 * Output is always a mono 16 kHz MP3 — matches what OpenAI Whisper expects
 * and keeps file size small (≈1 MB/min).
 */
export function createFfmpegDirectStreamAdapter() {
  return {
    /**
     * Start recording.
     *
     * @param {{ streamUrl: string, outputPath: string, durationSec: number }} p
     * @returns {{ stop: () => void, pid: number, done: Promise<{ outputPath: string }> }}
     */
    record({ streamUrl, outputPath, durationSec }) {
      mkdirSync(dirname(outputPath), { recursive: true });

      const args = [
        '-y',                          // overwrite without asking
        '-i', streamUrl,
        '-t', String(durationSec),
        '-vn',                         // drop video (e.g. from HLS with video track)
        '-ac', '1',                    // mono
        '-ar', '16000',                // 16 kHz — Whisper sweet-spot
        '-c:a', 'libmp3lame',
        '-q:a', '4',                   // VBR ~128 kbps — good quality/size trade-off
        outputPath,
      ];

      const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
      let stderrBuf = '';
      proc.stderr.on('data', (chunk) => {
        stderrBuf += chunk;
        // Keep only the last 2 KB to avoid unbounded growth on long recordings
        if (stderrBuf.length > 2048) stderrBuf = stderrBuf.slice(-2048);
      });

      const done = new Promise((resolve, reject) => {
        proc.on('error', reject);
        proc.on('close', (code) => {
          // FFmpeg exits 255 when killed via SIGINT — that is a normal stop
          if (code === 0 || code === 255 || code === null) {
            resolve({ outputPath });
          } else {
            reject(new Error(`ffmpeg exited ${code}: ${stderrBuf.slice(-500)}`));
          }
        });
      });

      return {
        stop: () => proc.kill('SIGINT'),
        pid: proc.pid,
        done,
      };
    },
  };
}
