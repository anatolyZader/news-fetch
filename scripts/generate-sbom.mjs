#!/usr/bin/env node
/**
 * Generate CycloneDX SBOM for npm dependencies.
 * Usage: node scripts/generate-sbom.mjs [outputPath]
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'coverage/sbom.json');
mkdirSync(dirname(out), { recursive: true });

const result = spawnSync(
  'npx',
  ['@cyclonedx/cyclonedx-npm', '--output-file', out, '--output-format', 'JSON'],
  { stdio: 'inherit', shell: true },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log(`SBOM written to ${out}`);
