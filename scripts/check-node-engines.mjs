#!/usr/bin/env node
/**
 * Fail if process.version is below package.json engines.node (e.g. >=22.13.0).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const range = pkg.engines?.node?.trim();
if (!range) {
  console.error('package.json has no engines.node');
  process.exit(1);
}

const m = range.match(/^>=(\d+)\.(\d+)\.(\d+)$/);
if (!m) {
  console.error(`Unsupported engines.node format: ${range} (expected >=x.y.z)`);
  process.exit(1);
}

const min = [Number(m[1]), Number(m[2]), Number(m[3])];
const cur = process.versions.node.split('.').map(Number);

function gte(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true;
    if (a[i] < b[i]) return false;
  }
  return true;
}

if (!gte(cur, min)) {
  console.error(
    `Node ${process.version} does not satisfy engines.node (${range}). Use .nvmrc or upgrade Node.`,
  );
  process.exit(1);
}

console.log(`Node ${process.version} OK (engines.node ${range})`);
