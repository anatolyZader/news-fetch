#!/usr/bin/env node
/**
 * Lightweight grep-based audit for common architecture smells.
 */
import { execSync } from 'node:child_process';

const checks = [
  {
    name: 'domain imports node:fs',
    cmd: "rg -l \"from 'node:fs'\" business_modules/**/domain --glob '*.js' || true",
  },
  {
    name: 'cross-module deep imports (non-index)',
    cmd: "rg \"from ['\\\"].*business_modules/[^'\\\"]+/(app|domain|infrastructure)/\" business_modules --glob '*.js' -g '!**/index.js' || true",
  },
  {
    name: 'empty catch blocks',
    cmd: "rg \"catch \\{\\s*\\}\" --glob '*.js' || true",
  },
];

let failed = 0;
for (const { name, cmd } of checks) {
  const out = execSync(cmd, { encoding: 'utf8', cwd: new URL('..', import.meta.url).pathname }).trim();
  if (out) {
    console.error(`FAIL: ${name}\n${out}\n`);
    failed += 1;
  } else {
    console.log(`OK: ${name}`);
  }
}
process.exit(failed > 0 ? 1 : 0);
