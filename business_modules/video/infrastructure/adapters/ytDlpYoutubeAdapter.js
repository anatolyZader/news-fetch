/**
 * YouTube / generic HTTP(S) video: yt-dlp + ffmpeg → MP3.
 * Requires `yt-dlp` on PATH (or YT_DLP_PATH) and ffmpeg.
 */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * @param {object} [deps]
 * @param {string} [deps.ytDlpPath]
 * @param {number} [deps.timeoutMs]
 */
export function createYtDlpYoutubeAdapter(deps = {}) {
  const ytDlpPath = deps.ytDlpPath ?? process.env.YT_DLP_PATH ?? 'yt-dlp';
  const timeoutMs = deps.timeoutMs ?? Number(process.env.YT_DLP_TIMEOUT_MS ?? 600_000);

  return {
    /**
     * @param {{ url: string, outputDir: string }} opts
     */
    async downloadAsMp3(opts) {
      const { url, outputDir } = opts;
      await mkdir(outputDir, { recursive: true });

      const stem = `video-${Date.now()}-${randomBytes(4).toString('hex')}`;
      const outputTemplate = join(outputDir, `${stem}.%(ext)s`);

      const args = [
        '-x',
        '--audio-format',
        'mp3',
        '--audio-quality',
        '0',
        '--no-playlist',
        '-o',
        outputTemplate,
        url,
      ];

      try {
        const result = await execFileAsync(ytDlpPath, args, {
          timeout: timeoutMs,
          maxBuffer: 50 * 1024 * 1024,
        });

        const outputPath = join(outputDir, `${stem}.mp3`);
        await access(outputPath);

        return {
          ok: true,
          outputPath,
          stem,
          stdout: result.stdout?.toString?.() ?? '',
          stderr: result.stderr?.toString?.() ?? '',
        };
      } catch (err) {
        return {
          ok: false,
          error: err?.message ?? String(err),
          stdout: err?.stdout?.toString?.() ?? '',
          stderr: err?.stderr?.toString?.() ?? '',
        };
      }
    },
  };
}
