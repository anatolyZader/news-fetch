import { createHash } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

export const INTEGRITY_MANIFEST_VERSION = 2;

/** Stable key for aggregate client/dist comparison (CI-canonical). */
export const CLIENT_DIST_AGGREGATE_KEY = 'client/dist@aggregateSha256';

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
 * @param {string} relPath
 * @returns {boolean}
 */
export function isClientDistPath(relPath) {
  return relPath.startsWith('client/dist/');
}

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
 * Roll up all client/dist file hashes into one stable digest (path + content).
 * Vite content-addressed chunk filenames differ across build hosts; aggregate is CI-canonical.
 *
 * @param {string} rootDir
 * @returns {Promise<{ aggregateSha256: string, fileCount: number } | null>}
 */
export async function buildClientDistAggregate(rootDir) {
  const distDir = join(rootDir, 'client/dist');
  const distFiles = await listClientDistFiles(distDir);
  if (distFiles.length === 0) return null;

  const hash = createHash('sha256');
  for (const abs of distFiles.sort()) {
    const rel = relative(rootDir, abs).replaceAll('\\', '/');
    hash.update(rel);
    hash.update('\0');
    hash.update(await sha256File(abs));
    hash.update('\0');
  }

  return {
    aggregateSha256: hash.digest('hex'),
    fileCount: distFiles.length,
  };
}

/**
 * @param {Record<string, string>} files
 * @returns {{ supplyChain: Record<string, string>, clientDist: Record<string, string> }}
 */
export function splitManifestFiles(files) {
  /** @type {Record<string, string>} */
  const supplyChain = {};
  /** @type {Record<string, string>} */
  const clientDist = {};
  for (const [path, digest] of Object.entries(files)) {
    if (isClientDistPath(path)) clientDist[path] = digest;
    else supplyChain[path] = digest;
  }
  return { supplyChain, clientDist };
}

/**
 * @param {{
 *   rootDir?: string,
 *   includeClientDist?: boolean,
 *   gitSha?: string | null,
 * }} [opts]
 * @returns {Promise<{
 *   version: number,
 *   recordedAt: string,
 *   gitSha: string | null,
 *   files: Record<string, string>,
 *   clientDist?: { aggregateSha256: string, fileCount: number },
 * }>}
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

  /** @type {{ aggregateSha256: string, fileCount: number } | undefined} */
  let clientDist;
  if (includeClientDist) {
    const aggregate = await buildClientDistAggregate(rootDir);
    if (aggregate) clientDist = aggregate;
  }

  return {
    version: INTEGRITY_MANIFEST_VERSION,
    recordedAt: new Date().toISOString(),
    gitSha: opts.gitSha ?? null,
    files,
    ...(clientDist ? { clientDist } : {}),
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
 * @param {{
 *   version?: number,
 *   files?: Record<string, string>,
 *   clientDist?: { aggregateSha256?: string, fileCount?: number },
 * }} baseline
 * @param {{
 *   version?: number,
 *   files?: Record<string, string>,
 *   clientDist?: { aggregateSha256?: string, fileCount?: number },
 * }} current
 * @returns {{ ok: boolean, drifts: Array<{ path: string, expected: string | null, actual: string | null }> }}
 */
export function compareIntegrityManifestRecords(baseline, current) {
  const baselineVersion = baseline.version ?? 1;
  const { supplyChain: baselineSupply } = splitManifestFiles(baseline.files ?? {});
  const { supplyChain: currentSupply } = splitManifestFiles(current.files ?? {});
  const supplyCompare = compareIntegrityManifests(baselineSupply, currentSupply);

  /** @type {Array<{ path: string, expected: string | null, actual: string | null }>} */
  const clientDrifts = [];

  if (baselineVersion >= 2 && baseline.clientDist?.aggregateSha256) {
    const expected = baseline.clientDist.aggregateSha256;
    const actual = current.clientDist?.aggregateSha256 ?? null;
    if (expected !== actual) {
      clientDrifts.push({ path: CLIENT_DIST_AGGREGATE_KEY, expected, actual });
    }
    const expectedCount = baseline.clientDist.fileCount ?? null;
    const actualCount = current.clientDist?.fileCount ?? null;
    if (expectedCount !== actualCount) {
      clientDrifts.push({
        path: 'client/dist@fileCount',
        expected: expectedCount == null ? null : String(expectedCount),
        actual: actualCount == null ? null : String(actualCount),
      });
    }
  } else {
    const { clientDist: baselineClient } = splitManifestFiles(baseline.files ?? {});
    const { clientDist: currentClient } = splitManifestFiles(current.files ?? {});
    const legacyClient = compareIntegrityManifests(baselineClient, currentClient);
    clientDrifts.push(...legacyClient.drifts);
  }

  const drifts = [...supplyCompare.drifts, ...clientDrifts];
  return { ok: drifts.length === 0, drifts };
}

/**
 * @param {string} dir
 * @returns {boolean}
 */
export function clientDistExists(dir = process.cwd()) {
  const dist = join(dir, 'client/dist');
  return existsSync(dist) && statSync(dist).isDirectory();
}
