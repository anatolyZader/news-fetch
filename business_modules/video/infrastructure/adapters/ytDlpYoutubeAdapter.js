/**
 * YouTube / generic HTTP(S) video: yt-dlp + ffmpeg → MP3; optional WebVTT subtitles only.
 * Requires `yt-dlp` on PATH (or YT_DLP_PATH) and ffmpeg.
 */
import { execFile } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { access, mkdir, readdir, readFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/**
 * @param {object} [deps]
 * @param {string} [deps.ytDlpPath]
 * @param {number} [deps.timeoutMs]
 */
/** Default subtitle languages (avoid `--sub-langs all`, which hammers YouTube and often triggers HTTP 429). */
const DEFAULT_SUB_LANGS = 'he,iw,en,en-US,en-GB';

export function createYtDlpYoutubeAdapter(deps = {}) {
  const ytDlpPath = deps.ytDlpPath ?? process.env.YT_DLP_PATH ?? 'yt-dlp';
  const timeoutMs = deps.timeoutMs ?? Number(process.env.YT_DLP_TIMEOUT_MS ?? 600_000);
  const subLangs = deps.subLangs ?? (process.env.YT_DLP_SUB_LANGS?.trim() || DEFAULT_SUB_LANGS);
  const jsRuntimes = deps.jsRuntimes ?? process.env.YT_DLP_JS_RUNTIMES?.trim() ?? null;

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
        ...(jsRuntimes ? ['--js-runtimes', jsRuntimes] : []),
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

    /**
     * Fetch YouTube captions as WebVTT without downloading video/audio (uses yt-dlp subtitle extraction).
     * @param {{ url: string, outputDir: string }} opts
     * @returns {Promise<{ ok: boolean, vttPaths?: string[], pickedPath?: string, vttText?: string, error?: string, stderr?: string }>}
     */
    async downloadSubtitleVttFiles(opts) {
      const { url, outputDir } = opts;
      await mkdir(outputDir, { recursive: true });

      const stem = `subs-${Date.now()}-${randomBytes(4).toString('hex')}`;
      const outputTemplate = join(outputDir, `${stem}.%(language)s.%(ext)s`);

      const args = [
        '--skip-download',
        '--write-subs',
        '--write-auto-subs',
        '--sub-format',
        'vtt',
        '--sub-langs',
        subLangs,
        '--no-playlist',
        ...(jsRuntimes ? ['--js-runtimes', jsRuntimes] : []),
        '-o',
        outputTemplate,
        url,
      ];

      try {
        const result = await execFileAsync(ytDlpPath, args, {
          timeout: timeoutMs,
          maxBuffer: 50 * 1024 * 1024,
        });

        const names = await readdir(outputDir);
        const vttPaths = names
          .filter((n) => n.startsWith(stem) && n.toLowerCase().endsWith('.vtt'))
          .map((n) => join(outputDir, n))
          .sort();

        if (vttPaths.length === 0) {
          return {
            ok: true,
            vttPaths: [],
            stderr: result.stderr?.toString?.() ?? '',
          };
        }

        const pickedPath = pickPreferredVttPath(vttPaths, stem);
        const vttText = await readFile(pickedPath, 'utf8');

        return {
          ok: true,
          vttPaths,
          pickedPath,
          vttText,
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

/**
 * Prefer Hebrew / Israeli English / English when multiple .vtt tracks exist.
 * @param {string[]} absolutePaths
 * @param {string} stem
 */
function pickPreferredVttPath(absolutePaths, stem) {
  const scored = absolutePaths.map((p) => {
    const base = basename(p);
    const lang =
      base === `${stem}.vtt`
        ? ''
        : base.slice(stem.length + 1).replace(/\.vtt$/i, '').toLowerCase();
    const order = ['he', 'iw', 'en', 'en-us', 'en-gb'];
    let rank = order.findIndex((o) => lang === o || lang.startsWith(`${o}-`));
    if (rank === -1) rank = order.findIndex((o) => lang.startsWith(o));
    if (rank === -1) rank = 99;
    return { p, rank };
  });
  scored.sort((a, b) => a.rank - b.rank);
  return scored[0].p;
}
