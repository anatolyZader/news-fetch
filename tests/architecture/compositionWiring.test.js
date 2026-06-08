import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const INFRA_IMPORT_RE = /from\s+['"](?:\.\.\/)*business_modules\/[^'"]+\/infrastructure\//;

const ALLOWED_PREFIXES = [
  join(ROOT, 'composition'),
  join(ROOT, 'tests'),
];

const SKIP_DIRS = new Set(['node_modules', 'client', 'tests', 'tools', 'analyst-site', 'coverage']);

function walkJsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      walkJsFiles(path, out);
      continue;
    }
    if (/\.(js|mjs|cjs)$/.test(name)) out.push(path);
  }
  return out;
}

function isAllowed(path) {
  return ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix));
}

test('cross-module infrastructure imports outside composition/ are absent in production code', () => {
  const offenders = [];
  for (const path of walkJsFiles(ROOT)) {
    if (isAllowed(path)) continue;
    const text = readFileSync(path, 'utf8');
    if (INFRA_IMPORT_RE.test(text)) {
      offenders.push(path.replace(`${ROOT}/`, ''));
    }
  }

  assert.deepEqual(offenders, []);
});
