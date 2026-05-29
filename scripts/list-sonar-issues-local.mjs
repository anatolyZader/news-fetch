#!/usr/bin/env node
/**
 * List Sonar-style issues via local ESLint (SonarJS + local rules).
 * Matches what SonarQube for IDE clears on save — no SonarCloud API lag.
 */

import { ESLint } from 'eslint';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toSonarRule } from './sonar-eslint-map.mjs';
import { SONAR_LIST_DEFAULT_LIMIT } from './sonar-defaults.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

/** @param {string} p */
function relPath(p) {
  return relative(ROOT, p).replaceAll('\\', '/');
}

/**
 * @param {object} opts
 * @param {number} opts.limit
 * @param {string} [opts.file]
 * @param {string} [opts.rule]
 */
export async function listLocalSonarIssues(opts) {
  const eslint = new ESLint({
    cwd: ROOT,
    overrideConfigFile: resolve(ROOT, 'eslint.sonar.config.js'),
    errorOnUnmatchedPattern: false,
  });

  const patterns = opts.file
    ? [opts.file]
    : [
      'business_modules/**/*.{js,mjs,cjs,jsx}',
      'cross-cut-modules/**/*.{js,mjs,cjs,jsx}',
      'api/**/*.{js,mjs,cjs,jsx}',
      'auth/**/*.{js,mjs,cjs,jsx}',
      'utils/**/*.{js,mjs,cjs,jsx}',
      'shared/**/*.{js,mjs,cjs,jsx}',
      'scripts/**/*.{js,mjs,cjs,jsx}',
      'client/src/**/*.{js,jsx}',
      'app.js',
      'server.js',
    ];

  const results = await eslint.lintFiles(patterns);
  /** @type {Array<Record<string, unknown>>} */
  const items = [];

  for (const fileResult of results) {
    const file = relPath(fileResult.filePath);
    for (const msg of fileResult.messages) {
      if (msg.severity < 2) continue;
      const rule = toSonarRule(msg.ruleId ?? 'unknown');
      if (opts.rule && rule !== opts.rule) continue;
      items.push({
        kind: 'issue',
        key: `local:${file}:${msg.line}:${rule}:${msg.column}`,
        type: 'CODE_SMELL',
        severity: 'MAJOR',
        status: 'OPEN',
        rule,
        eslintRule: msg.ruleId ?? null,
        file,
        line: msg.line,
        column: msg.column,
        message: msg.message,
        effort: null,
        source: 'local-eslint',
      });
    }
  }

  items.sort((a, b) => {
    const fileA = typeof a.file === 'string' ? a.file : '';
    const fileB = typeof b.file === 'string' ? b.file : '';
    const fc = fileA.localeCompare(fileB);
    if (fc !== 0) return fc;
    return (Number(a.line) || 0) - (Number(b.line) || 0);
  });

  return {
    projectKey: 'local-eslint',
    inNewCodePeriod: null,
    branch: null,
    source: 'local-eslint',
    count: Math.min(items.length, opts.limit),
    total: items.length,
    items: items.slice(0, opts.limit),
  };
}

/**
 * @param {string[]} files
 * @returns {Promise<{ ok: boolean, remaining: number, items: object[] }>}
 */
export async function verifyLocalSonarFiles(files) {
  /** @type {object[]} */
  const all = [];
  for (const file of files) {
    const result = await listLocalSonarIssues({ limit: SONAR_LIST_DEFAULT_LIMIT, file });
    all.push(...result.items);
  }
  return { ok: all.length === 0, remaining: all.length, items: all };
}

function parseCliArgs(argv) {
  let limit = SONAR_LIST_DEFAULT_LIMIT;
  let file = '';
  let rule = '';
  let json = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--limit' && argv[i + 1]) {
      limit = Number(argv[++i]);
      continue;
    }
    if (arg === '--file' && argv[i + 1]) {
      file = argv[++i];
      continue;
    }
    if (arg === '--rule' && argv[i + 1]) {
      rule = argv[++i];
      continue;
    }
    console.error(`Unknown argument: ${arg}`);
    process.exit(1);
  }

  if (!Number.isFinite(limit) || limit < 1) {
    console.error('--limit must be a positive number');
    process.exit(1);
  }

  return { limit, file, rule, json };
}

function printLocalIssues(payload) {
  if (!payload.items.length) {
    console.log('No local Sonar-style ESLint issues.');
    return;
  }
  console.log(`Local Sonar-style issues (${payload.count} shown, ${payload.total} total):`);
  for (const row of payload.items) {
    const loc = row.line ? `${row.file}:${row.line}` : row.file;
    const rule = typeof row.rule === 'string' ? row.rule : '';
    const message = typeof row.message === 'string' ? row.message : '';
    console.log(`${rule} ${loc} — ${message}`);
  }
}

const isMainModule = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMainModule) {
  const { limit, file, rule, json } = parseCliArgs(process.argv.slice(2));

  try {
    const payload = await listLocalSonarIssues({ limit, file, rule });
    if (json) {
      console.log(JSON.stringify(payload, null, 2));
      process.exit(0);
    }
    printLocalIssues(payload);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
