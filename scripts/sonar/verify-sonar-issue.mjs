#!/usr/bin/env node
/**
 * Verify a single Sonar issue is cleared locally (profile-aligned ESLint).
 * exit 0 = issue cleared at line; exit 1 = still present or unmapped rule.
 */

import { ESLint } from 'eslint';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { eslintRulesForSonar } from './sonar-eslint-map.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));

function usage() {
  console.error(`Usage: node scripts/sonar/verify-sonar-issue.mjs --file <path> --line <n> --rule <javascript:Sxxxx>

Exit codes:
  0  No ESLint report at line for the mapped rule(s) — issue cleared locally
  1  Issue still present, bad args, or rule not mapped locally`);
}

/** @type {{ file: string, line: number, rule: string, json: boolean }} */
const opts = { file: '', line: 0, rule: '', json: false };

const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  const arg = argv[i];
  if (arg === '-h' || arg === '--help') {
    usage();
    process.exit(1);
  }
  if (arg === '--file' && argv[i + 1]) {
    opts.file = argv[++i];
    continue;
  }
  if (arg === '--line' && argv[i + 1]) {
    opts.line = Number(argv[++i]);
    continue;
  }
  if (arg === '--rule' && argv[i + 1]) {
    opts.rule = argv[++i];
    continue;
  }
  if (arg === '--json') {
    opts.json = true;
    continue;
  }
  console.error(`Unknown argument: ${arg}`);
  usage();
  process.exit(1);
}

if (!opts.file || !opts.rule || !Number.isFinite(opts.line) || opts.line < 1) {
  usage();
  process.exit(1);
}

const eslintRuleIds = eslintRulesForSonar(opts.rule);
if (!eslintRuleIds.length) {
  const out = {
    ok: false,
    file: opts.file,
    line: opts.line,
    rule: opts.rule,
    reason: 'no-eslint-mapping',
    message: `No local ESLint mapping for ${opts.rule}`,
  };
  if (opts.json) console.log(JSON.stringify(out, null, 2));
  else console.error(out.message);
  process.exit(1);
}

const eslint = new ESLint({
  cwd: ROOT,
  overrideConfigFile: resolve(ROOT, 'eslint.sonar.config.js'),
});

const absFile = resolve(ROOT, opts.file);
const results = await eslint.lintFiles([absFile]);
const fileResult = results[0];

if (!fileResult) {
  const out = { ok: false, file: opts.file, line: opts.line, rule: opts.rule, reason: 'file-not-linted' };
  if (opts.json) console.log(JSON.stringify(out, null, 2));
  else console.error(`Could not lint ${opts.file}`);
  process.exit(1);
}

const relFile = relative(ROOT, absFile).replaceAll('\\', '/');
const atLine = fileResult.messages.filter(
  (msg) => msg.line === opts.line && msg.severity >= 2 && eslintRuleIds.includes(msg.ruleId ?? ''),
);

const out = {
  ok: atLine.length === 0,
  file: relFile,
  line: opts.line,
  rule: opts.rule,
  eslintRules: eslintRuleIds,
  remaining: atLine.map((m) => ({
    eslintRule: m.ruleId,
    message: m.message,
    column: m.column,
  })),
};

if (opts.json) {
  console.log(JSON.stringify(out, null, 2));
} else if (out.ok) {
  console.log(`OK ${opts.rule} cleared at ${relFile}:${opts.line}`);
} else {
  console.error(`FAIL ${opts.rule} still at ${relFile}:${opts.line}`);
  for (const m of atLine) {
    console.error(`  ${m.ruleId}: ${m.message}`);
  }
}

process.exit(out.ok ? 0 : 1);
