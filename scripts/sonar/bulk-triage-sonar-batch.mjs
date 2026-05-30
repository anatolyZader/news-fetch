#!/usr/bin/env node
/**
 * Bulk auto-triage for /fix-sonar: verify each issue, mark fixed if cleared, skip if unmapped.
 * Issues that still fail verify are left for manual/code fixes.
 */

import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

/** @param {string[]} args @returns {{ status: number, stdout: string }} */
function runNode(script, args) {
  const r = spawnSync(process.execPath, [resolve(ROOT, script), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return { status: r.status ?? 1, stdout: (r.stdout || '').trim() };
}

/** @param {object} issue */
function triageIssue(issue) {
  const verify = runNode('scripts/sonar/verify-sonar-issue.mjs', [
    '--file', issue.file,
    '--line', String(issue.line),
    '--rule', issue.rule,
    '--json',
  ]);

  if (verify.status === 0) {
    runNode('scripts/sonar/fix-sonar-loop.mjs', ['--mark-fixed', issue.key]);
    return 'fixed';
  }

  let reason = 'still-present';
  try {
    const parsed = JSON.parse(verify.stdout || '{}');
    reason = parsed.reason || reason;
  } catch {
    // keep default
  }

  if (reason === 'no-eslint-mapping') {
    runNode('scripts/sonar/fix-sonar-loop.mjs', ['--mark-skipped', issue.key, '--reason', 'no-eslint-mapping']);
    return 'skipped';
  }

  return 'needs-fix';
}

function parseArgs(argv) {
  let batchLimit = 100;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--limit' && argv[i + 1]) {
      batchLimit = Number(argv[++i]);
    }
  }
  return { batchLimit };
}

const { batchLimit } = parseArgs(process.argv.slice(2));
const batchOut = runNode('scripts/sonar/fix-sonar-loop.mjs', ['--next-batch', '--limit', String(batchLimit)]);
const batch = JSON.parse(batchOut.stdout);
if (batch.done) {
  console.log(JSON.stringify({ done: true, remaining: 0 }, null, 2));
  process.exit(0);
}

const counts = { fixed: 0, skipped: 0, needsFix: 0 };
/** @type {object[]} */
const needsFix = [];

for (const issue of batch.issues) {
  const result = triageIssue(issue);
  counts[result === 'needs-fix' ? 'needsFix' : result] += 1;
  if (result === 'needs-fix' && needsFix.length < 40) needsFix.push(issue);
}

const status = JSON.parse(runNode('scripts/sonar/fix-sonar-loop.mjs', ['--status']).stdout);
console.log(JSON.stringify({ counts, batchSize: batch.batchSize, status, needsFixSample: needsFix }, null, 2));
