#!/usr/bin/env node
/**
 * Record integrity baseline after verified build (lockfiles, configs, client/dist hashes).
 */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildIntegrityManifest } from '../cross-cut-modules/security/app/integrityManifest.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE_PATH = join(ROOT, 'security/integrity-baseline.json');

function gitSha() {
  try {
    return execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const manifest = await buildIntegrityManifest({
    rootDir: ROOT,
    includeClientDist: true,
    gitSha: gitSha(),
  });

  mkdirSync(dirname(BASELINE_PATH), { recursive: true });
  writeFileSync(BASELINE_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(`Integrity baseline recorded: ${BASELINE_PATH}`);
  console.log(`Files hashed: ${Object.keys(manifest.files).length}`);
  console.log(`Git SHA: ${manifest.gitSha ?? 'unknown'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
