#!/usr/bin/env node
/**
 * List Sonar-style issues for /fix-sonar.
 * Default: SonarCloud API (same scope as IDE Connected Mode panel).
 * --local-only: profile-aligned local ESLint (offline fallback).
 */

import dotenv from 'dotenv';
import { fetchSonarCloudIssues } from './sonar-cloud-client.mjs';
import { listLocalSonarIssues } from './list-sonar-issues-local.mjs';
import { resolveSonarBranch } from './sonar-git-branch.mjs';
import { SONAR_LIST_DEFAULT_LIMIT } from './sonar-defaults.mjs';

dotenv.config();

/** @param {unknown} value */
function sonarText(value) {
  return typeof value === 'string' ? value : '';
}

function usage() {
  console.error(`Usage: node scripts/sonar/list-sonar-issues.mjs [options]

Options:
  --remote                    List issues from SonarCloud API (default)
  --local-only                List via profile-aligned local ESLint (offline fallback)
  --all-issues                Return full queue (no cap; paginates all pages)
  --next                      Return only the first issue (limit 1)
  --status OPEN,CONFIRMED     Comma-separated issue statuses (default: OPEN,CONFIRMED,REOPENED)
  --types BUG,CODE_SMELL      Comma-separated issue types (default: BUG,CODE_SMELL,VULNERABILITY)
  --in-new-code               Only issues in the new-code period (remote only)
  --branch <name>             Filter to issues on a branch (default: current git branch)
  --limit <n>                 Max issues to return (default: ${SONAR_LIST_DEFAULT_LIMIT}, or all with --all-issues)
  --file <path>               Limit local analysis to one file (--local-only)
  --rule <javascript:Sxxxx>   Filter by Sonar rule key (--local-only)
  --json                      Output JSON (default: human-readable lines)
  --hotspots                  Also list TO_REVIEW security hotspots (remote only)
  -h, --help                  Show this help`);
}

/** @type {Record<string, string | boolean | number>} */
const opts = {
  remote: true,
  localOnly: false,
  status: 'OPEN,CONFIRMED,REOPENED',
  types: 'BUG,CODE_SMELL,VULNERABILITY',
  inNewCode: false,
  branch: '',
  limit: SONAR_LIST_DEFAULT_LIMIT,
  allIssues: false,
  next: false,
  file: '',
  rule: '',
  json: false,
  hotspots: false,
};

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '-h' || arg === '--help') {
    usage();
    process.exit(0);
  }
  if (arg === '--local-only' || arg === '--local') {
    opts.localOnly = true;
    opts.remote = false;
    continue;
  }
  if (arg === '--remote') {
    opts.remote = true;
    opts.localOnly = false;
    continue;
  }
  if (arg === '--all-issues' || arg === '--all') {
    opts.allIssues = true;
    continue;
  }
  if (arg === '--next') {
    opts.next = true;
    continue;
  }
  if (arg === '--in-new-code') {
    opts.inNewCode = true;
    continue;
  }
  if (arg === '--json') {
    opts.json = true;
    continue;
  }
  if (arg === '--hotspots') {
    opts.hotspots = true;
    continue;
  }
  if (arg === '--status' && argv[i + 1]) {
    opts.status = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === '--types' && argv[i + 1]) {
    opts.types = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === '--branch' && argv[i + 1]) {
    opts.branch = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === '--limit' && argv[i + 1]) {
    opts.limit = Number(argv[i + 1]);
    i += 1;
    continue;
  }
  if (arg === '--file' && argv[i + 1]) {
    opts.file = argv[i + 1];
    i += 1;
    continue;
  }
  if (arg === '--rule' && argv[i + 1]) {
    opts.rule = argv[i + 1];
    i += 1;
    continue;
  }
  console.error(`Unknown argument: ${arg}`);
  usage();
  process.exit(1);
}

let effectiveLimit;
if (opts.next) {
  effectiveLimit = 1;
} else if (opts.allIssues) {
  effectiveLimit = Number.POSITIVE_INFINITY;
} else {
  effectiveLimit = opts.limit;
}

if (!opts.allIssues && !opts.next && (!Number.isFinite(opts.limit) || opts.limit < 1)) {
  console.error('--limit must be a positive number');
  process.exit(1);
}

if (opts.localOnly) {
  try {
    const payload = await listLocalSonarIssues({
      limit: effectiveLimit,
      file: opts.file,
      rule: opts.rule,
    });
    if (opts.json) {
      console.log(JSON.stringify(payload, null, 2));
      process.exit(0);
    }
    if (!payload.items.length) {
      console.log('No local Sonar-style ESLint issues.');
      process.exit(0);
    }
    console.log(`Local Sonar-style issues (${payload.count} shown, ${payload.total} total):`);
    for (const row of payload.items) {
      console.log(formatIssueLine(row));
    }
    process.exit(0);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

function formatIssueLine(row) {
  const file = String(row.file ?? '');
  const line = row.line == null ? '' : String(row.line);
  const loc = line === '' ? file : `${file}:${line}`;
  return `${sonarText(row.rule)} ${loc} — ${sonarText(row.message)}`;
}

function formatRemoteIssueLine(row) {
  const file = String(row.file ?? '');
  const line = row.line == null ? '' : String(row.line);
  const loc = line === '' ? file : `${file}:${line}`;
  const kind = String(row.kind ?? '');
  const type = String(row.type ?? '');
  const severity = String(row.severity ?? '');
  return `[${kind}] ${type}/${severity} ${loc} — ${String(row.message ?? '')}`;
}

const token = process.env.SONAR_TOKEN;
const projectKey = process.env.SONAR_PROJECT_KEY;

if (!token || !projectKey) {
  console.error('SONAR_TOKEN and SONAR_PROJECT_KEY are required (set in .env).');
  console.error('Use --local-only for offline profile-aligned ESLint queue.');
  process.exit(1);
}

try {
  const branch = resolveSonarBranch(opts.branch);
  const payload = await fetchSonarCloudIssues({
    token,
    projectKey,
    statuses: opts.status,
    types: opts.types,
    inNewCode: opts.inNewCode,
    branch,
    limit: effectiveLimit,
    hotspots: opts.hotspots,
  });

  if (opts.json) {
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
  }

  if (!payload.items.length) {
    console.log('No matching SonarCloud issues.');
    process.exit(0);
  }

  const branchSuffix = branch ? `, branch ${branch}` : '';
  console.log(`SonarCloud issues (${payload.count} shown, project ${projectKey}${branchSuffix}):`);
  for (const row of payload.items) {
    console.log(formatRemoteIssueLine(row));
    console.log(`  rule=${sonarText(row.rule)} key=${sonarText(row.key)}`);
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}
