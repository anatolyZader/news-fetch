import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BUSINESS_MODULES = join(ROOT, 'business_modules');

const FORBIDDEN_IMPORT_RE = /from\s+['"](?:\.\.\/)+(?:domain|infrastructure)\//;

function listInputFiles() {
  const files = [];
  for (const moduleName of readdirSync(BUSINESS_MODULES)) {
    const inputDir = join(BUSINESS_MODULES, moduleName, 'input');
    try {
      statSync(inputDir);
    } catch {
      continue;
    }
    for (const name of readdirSync(inputDir)) {
      if (/\.(js|mjs|cjs)$/.test(name)) {
        files.push(join(inputDir, name));
      }
    }
  }
  return files;
}

test('Option B: business_modules/*/input imports only app/ or index (not own domain/ or infrastructure/)', () => {
  const offenders = [];

  for (const path of listInputFiles()) {
    const text = readFileSync(path, 'utf8');
    if (FORBIDDEN_IMPORT_RE.test(text)) {
      const relPath = path.replace(`${ROOT}/`, '');
      offenders.push(`${relPath}: imports own domain/ or infrastructure/`);
    }
  }

  assert.deepEqual(offenders, []);
});
