import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

export const INTEGRITY_MANIFEST_VERSION = 1;

/** @type {readonly string[]} */
export const INTEGRITY_PATHS = [
  'package-lock.json',
  'client/package-lock.json',
  'analyst-site/package-lock.json',
  'tools/docs-site/package-lock.json',
  '.nvmrc',
  'openapi/openapi.yaml',
  '.github/dependabot.yml',
  '.github/actions/setup-npm-ci/action.yml',
];

/**
 * @param {string} filePath
 * @returns {Promise<string>}
 */
export async function sha256File(filePath) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    createReadStream(filePath)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolve);
  });
  return hash.digest('hex');
}

/**
 * @param {string} dir
 * @returns {Promise<string[]>}
 */
async function listClientDistFiles(dir) {
  /** @type {string[]} */
  const out = [];
  if (!existsSync(dir)) return out;

  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listClientDistFiles(full)));
    } else if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

/**
 * @param {{
 *   rootDir?: string,
 *   includeClientDist?: boolean,
 *   gitSha?: string | null,
 * }} [opts]
 * @returns {Promise<{ version: number, recordedAt: string, gitSha: string | null, files: Record<string, string> }>}
 */
export async function buildIntegrityManifest(opts = {}) {
  const rootDir = opts.rootDir ?? process.cwd();
  const includeClientDist = opts.includeClientDist ?? true;
  /** @type {Record<string, string>} */
  const files = {};

  for (const relPath of INTEGRITY_PATHS) {
    const abs = join(rootDir, relPath);
    if (!existsSync(abs)) continue;
    files[relPath] = await sha256File(abs);
  }

  if (includeClientDist) {
    const distDir = join(rootDir, 'client/dist');
    const distFiles = await listClientDistFiles(distDir);
    for (const abs of distFiles.sort()) {
      const rel = relative(rootDir, abs).replaceAll('\\', '/');
      files[rel] = await sha256File(abs);
    }
  }

  return {
    version: INTEGRITY_MANIFEST_VERSION,
    recordedAt: new Date().toISOString(),
    gitSha: opts.gitSha ?? null,
    files,
  };
}

/**
 * @param {Record<string, string>} baselineFiles
 * @param {Record<string, string>} currentFiles
 * @returns {{ ok: boolean, drifts: Array<{ path: string, expected: string | null, actual: string | null }> }}
 */
export function compareIntegrityManifests(baselineFiles, currentFiles) {
  /** @type {Array<{ path: string, expected: string | null, actual: string | null }>} */
  const drifts = [];
  const paths = new Set([...Object.keys(baselineFiles), ...Object.keys(currentFiles)]);

  for (const path of [...paths].sort()) {
    const expected = baselineFiles[path] ?? null;
    const actual = currentFiles[path] ?? null;
    if (expected !== actual) {
      drifts.push({ path, expected, actual });
    }
  }

  return { ok: drifts.length === 0, drifts };
}

/**
 * @param {{ files: Record<string, string> }} baseline
 * @param {{ files: Record<string, string> }} current
 * @returns {{ ok: boolean, drifts: Array<{ path: string, expected: string | null, actual: string | null }> }}
 */
export function compareIntegrityManifestRecords(baseline, current) {
  return compareIntegrityManifests(baseline.files ?? {}, current.files ?? {});
}

/**
 * @param {string} dir
 * @returns {boolean}
 */
export function clientDistExists(dir = process.cwd()) {
  const dist = join(dir, 'client/dist');
  return existsSync(dist) && statSync(dist).isDirectory();
}
