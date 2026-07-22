#!/usr/bin/env node
/**
 * Quarterly helper: list direct root dependencies and flag those with no
 * import under application source paths.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const SCAN_DIRS = ['business_modules', 'scripts', 'cross-cut-modules', 'utils'];
const SCAN_FILES = ['server.js'];

/** @type {string[]} */
const sourceFiles = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const st = statSync(path);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'tests') continue;
      walk(path);
    } else if (/\.(js|mjs|cjs)$/.test(name)) {
      sourceFiles.push(path);
    }
  }
}

for (const dir of SCAN_DIRS) {
  walk(join(ROOT, dir));
}
for (const file of SCAN_FILES) {
  sourceFiles.push(join(ROOT, file));
}

const corpus = sourceFiles.map((p) => readFileSync(p, 'utf8')).join('\n');

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const direct = Object.keys(pkg.dependencies ?? {});

console.log(`Root production dependencies: ${direct.length}\n`);

/** @type {string[]} */
const unused = [];

for (const name of direct.toSorted((a, b) => a.localeCompare(b))) {
  const patterns = [
    `from '${name}'`,
    `from "${name}"`,
    `require('${name}')`,
    `require("${name}")`,
    `import('${name}')`,
  ];
  const scoped = name.startsWith('@') ? name.split('/')[1] : null;
  if (scoped) {
    patterns.push(`'${scoped}'`, `"${scoped}"`);
  }
  const found = patterns.some((p) => corpus.includes(p));
  const status = found ? 'used' : 'NO IMPORT FOUND';
  console.log(`  ${name}: ${status}`);
  if (!found) unused.push(name);
}

if (unused.length > 0) {
  console.log('\nReview candidates (no import in app paths):');
  for (const name of unused) {
    console.log(`  - ${name}`);
  }
  console.log('\nConfirm before removing (CLI-only, dynamic import, or binary may not appear).');
} else {
  console.log('\nAll direct production dependencies appear referenced in scanned paths.');
}

console.log('\nAlso review: client/package.json, docs-site/package.json (separate lockfiles).');
console.log('See docs/DEPENDENCIES.md for the full inventory.');
