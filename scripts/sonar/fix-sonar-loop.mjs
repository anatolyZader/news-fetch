#!/usr/bin/env node
/**
 * Loop driver for /fix-sonar — fetches full SonarCloud queue, tracks progress, prints next issue.
 */

import dotenv from 'dotenv';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { fetchSonarCloudIssues } from './sonar-cloud-client.mjs';
import { resolveSonarBranch } from './sonar-git-branch.mjs';
import { FIX_SONAR_BATCH_SIZE } from './sonar-defaults.mjs';

dotenv.config();

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const STATE_PATH = resolve(ROOT, '.cursor/sonar-fix-progress.json');

function usage() {
  console.error(`Usage: node scripts/sonar/fix-sonar-loop.mjs [command] [options]

Commands:
  (default)     Fetch full remote queue JSON (--all-issues)
  --init        Reset progress and cache full queue in state file
  --next        Print next unfixed issue JSON (uses cached queue + progress)
  --next-batch  Print next batch of unfixed issues (default: 500; loop until queue empty)
  --mark-fixed <key>   Mark issue key as fixed
  --mark-skipped <key> [--reason text]  Mark issue skipped
  --status      Print progress counts JSON
  --reset       Clear progress state
  --verify      Pass through to verify-sonar-issue.mjs (--file --line --rule)

Options:
  --local-only  Use profile-aligned local queue instead of SonarCloud
  --branch <name>             SonarCloud branch (default: current git branch)
  --in-new-code               Only issues in the new-code period (remote)
  --hotspots                  Include TO_REVIEW security hotspots (remote)
  --limit <n>                 Cap --next-batch size (default: 500 from sonar-defaults.mjs)
  --json        JSON output (default for --next and --status)`);
}

/** @returns {{ fixed: string[], skipped: Record<string, string>, queue: object[] | null }} */
function loadState() {
  if (!existsSync(STATE_PATH)) {
    return { fixed: [], skipped: {}, queue: null };
  }
  return JSON.parse(readFileSync(STATE_PATH, 'utf8'));
}

/** @param {ReturnType<typeof loadState>} state */
function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

/** @param {object} opts */
async function fetchQueue(opts) {
  if (opts.localOnly) {
    const { listLocalSonarIssues } = await import('./list-sonar-issues-local.mjs');
    const payload = await listLocalSonarIssues({ limit: Number.POSITIVE_INFINITY });
    return payload.items;
  }

  const token = process.env.SONAR_TOKEN;
  const projectKey = process.env.SONAR_PROJECT_KEY;
  if (!token || !projectKey) {
    throw new Error('SONAR_TOKEN and SONAR_PROJECT_KEY required (set in .env) or use --local-only');
  }

  const payload = await fetchSonarCloudIssues({
    token,
    projectKey,
    branch: resolveSonarBranch(opts.branch),
    inNewCode: opts.inNewCode,
    hotspots: opts.hotspots,
    limit: Number.POSITIVE_INFINITY,
  });
  return payload.items;
}

/** @type {{ command: string, localOnly: boolean, branch: string, inNewCode: boolean, hotspots: boolean, key: string, reason: string, verifyArgs: string[] }} */
const opts = {
  command: 'fetch',
  localOnly: false,
  branch: '',
  inNewCode: false,
  hotspots: false,
  key: '',
  reason: '',
  verifyArgs: [],
  batchLimit: FIX_SONAR_BATCH_SIZE,
};

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '-h' || arg === '--help') {
    usage();
    process.exit(0);
  }
  if (arg === '--init') {
    opts.command = 'init';
    continue;
  }
  if (arg === '--next') {
    opts.command = 'next';
    continue;
  }
  if (arg === '--next-batch') {
    opts.command = 'next-batch';
    continue;
  }
  if (arg === '--status') {
    opts.command = 'status';
    continue;
  }
  if (arg === '--reset') {
    opts.command = 'reset';
    continue;
  }
  if (arg === '--verify') {
    opts.command = 'verify';
    opts.verifyArgs = argv.slice(i + 1);
    break;
  }
  if (arg === '--mark-fixed' && argv[i + 1]) {
    opts.command = 'mark-fixed';
    opts.key = argv[++i];
    continue;
  }
  if (arg === '--mark-skipped' && argv[i + 1]) {
    opts.command = 'mark-skipped';
    opts.key = argv[++i];
    continue;
  }
  if (arg === '--reason' && argv[i + 1]) {
    opts.reason = argv[++i];
    continue;
  }
  if (arg === '--local-only') {
    opts.localOnly = true;
    continue;
  }
  if (arg === '--branch' && argv[i + 1]) {
    opts.branch = argv[++i];
    continue;
  }
  if (arg === '--in-new-code') {
    opts.inNewCode = true;
    continue;
  }
  if (arg === '--hotspots') {
    opts.hotspots = true;
    continue;
  }
  if (arg === '--limit' && argv[i + 1]) {
    opts.batchLimit = Number(argv[++i]);
    continue;
  }
  console.error(`Unknown argument: ${arg}`);
  usage();
  process.exit(1);
}

if (opts.command === 'verify') {
  const result = spawnSync(
    process.execPath,
    [resolve(ROOT, 'scripts/sonar/verify-sonar-issue.mjs'), ...opts.verifyArgs],
    { stdio: 'inherit', cwd: ROOT },
  );
  process.exit(result.status ?? 1);
}

if (opts.command === 'reset') {
  saveState({ fixed: [], skipped: {}, queue: null });
  console.log(JSON.stringify({ reset: true }, null, 2));
  process.exit(0);
}

try {
  if (opts.command === 'mark-fixed') {
    const state = loadState();
    if (!state.fixed.includes(opts.key)) state.fixed.push(opts.key);
    delete state.skipped[opts.key];
    saveState(state);
    console.log(JSON.stringify({ marked: 'fixed', key: opts.key }, null, 2));
    process.exit(0);
  }

  if (opts.command === 'mark-skipped') {
    const state = loadState();
    state.skipped[opts.key] = opts.reason || 'skipped';
    saveState(state);
    console.log(JSON.stringify({ marked: 'skipped', key: opts.key, reason: state.skipped[opts.key] }, null, 2));
    process.exit(0);
  }

  if (opts.command === 'init') {
    const queue = await fetchQueue(opts);
    const state = { fixed: [], skipped: {}, queue };
    saveState(state);
    console.log(JSON.stringify({
      initialized: true,
      total: queue.length,
      source: opts.localOnly ? 'local-eslint' : 'sonarcloud',
    }, null, 2));
    process.exit(0);
  }

  let state = loadState();
  if (!state.queue?.length || opts.command === 'fetch') {
    const queue = await fetchQueue(opts);
    state = { ...state, queue };
    saveState(state);
  }

  const done = new Set([...state.fixed, ...Object.keys(state.skipped)]);
  const remaining = (state.queue ?? []).filter((item) => !done.has(item.key));

  if (opts.command === 'status') {
    console.log(JSON.stringify({
      total: state.queue?.length ?? 0,
      fixed: state.fixed.length,
      skipped: Object.keys(state.skipped).length,
      remaining: remaining.length,
    }, null, 2));
    process.exit(0);
  }

  if (opts.command === 'next' || opts.command === 'next-batch') {
    if (!remaining.length) {
      console.log(JSON.stringify({ done: true, remaining: 0 }, null, 2));
      process.exit(0);
    }
    if (opts.command === 'next') {
      console.log(JSON.stringify({ issue: remaining[0], remaining: remaining.length }, null, 2));
      process.exit(0);
    }
    const cap = Number.isFinite(opts.batchLimit) && opts.batchLimit > 0
      ? opts.batchLimit
      : remaining.length;
    const batch = remaining.slice(0, cap);
    console.log(JSON.stringify({
      issues: batch,
      batchSize: batch.length,
      remaining: remaining.length,
    }, null, 2));
    process.exit(0);
  }

  console.log(JSON.stringify({
    total: state.queue?.length ?? 0,
    remaining: remaining.length,
    items: state.queue ?? [],
  }, null, 2));
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
