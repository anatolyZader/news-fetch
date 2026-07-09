#!/usr/bin/env node
/**
 * One-time migration: flat daily_reports/ → module-owned data/ dirs.
 *
 * Usage:
 *   node scripts/migrate-daily-reports-to-module-data.js           # dry-run (default)
 *   node scripts/migrate-daily-reports-to-module-data.js --apply
 */
import { existsSync, mkdirSync, renameSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(REPO_ROOT, 'daily_reports');
const APPLY = process.argv.includes('--apply');

/** @type {Array<{ test: RegExp, target: string }>} */
const RULES = [
  { test: /^resilience-report(?:-north)?-.*\.(json|md)$/, target: 'business_modules/resilience_scorer/data/daily_reports' },
  { test: /^oov-capture-.*\.jsonl$/, target: 'business_modules/resilience_scorer/data/oov_captures' },
  { test: /^omission-audit-.*\.json$/, target: 'business_modules/resilience_scorer/data/omission_audits' },
  { test: /^survey-|^שאלון|survey-question-mapping\.json$/i, target: 'business_modules/resilience_scorer/data/survey' },
  { test: /^assessment-agent-trace-.*\.jsonl$/, target: 'business_modules/specialist_agents/data/traces' },
  { test: /^agent-eval-negative\.jsonl$/, target: 'business_modules/specialist_agents/data/eval' },
  { test: /^(shadow-scores|divergence)-.*\.json$/, target: 'business_modules/resilience_scorer/analyst/data/shadow' },
  { test: /^review-.*\.md$/, target: 'business_modules/resilience_scorer/analyst/data/reviews' },
  { test: /^epistemic-profile-.*\.json$/, target: 'business_modules/epistemic_features/data/profiles' },
  { test: /^(translation|locale)-.*\.json$/, target: 'business_modules/translation/data/locale' },
  { test: /^event-report-.*\.(json|md)$/, target: 'business_modules/pbo_report_muni/data/reports' },
  { test: /^catalog-gap-report\.md$/, target: 'business_modules/signal_catalog_evolution/data' },
];

function resolveTarget(name) {
  for (const rule of RULES) {
    if (rule.test.test(name)) return join(REPO_ROOT, rule.target);
  }
  return null;
}

function main() {
  if (!existsSync(SOURCE)) {
    console.log(`No ${SOURCE} — nothing to migrate.`);
    return;
  }

  const files = readdirSync(SOURCE).filter((f) => f !== '.' && f !== '..');
  let moved = 0;
  const unmoved = [];

  for (const name of files) {
    const src = join(SOURCE, name);
    const targetDir = resolveTarget(name);
    if (!targetDir) {
      unmoved.push(name);
      continue;
    }
    mkdirSync(targetDir, { recursive: true });
    const dest = join(targetDir, name);
    if (APPLY) {
      renameSync(src, dest);
    }
    const relativeTargetDir = targetDir.replace(`${REPO_ROOT}/`, '');
    console.log(`${APPLY ? 'MOVED' : 'WOULD MOVE'}: ${name} → ${relativeTargetDir}`);
    moved += 1;
  }

  console.log(`\n${APPLY ? 'Moved' : 'Would move'}: ${moved} file(s)`);
  if (unmoved.length) {
    console.log(`Unmoved (${unmoved.length}):`);
    for (const f of unmoved.slice(0, 30)) console.log(`  - ${f}`);
    if (unmoved.length > 30) console.log(`  ... and ${unmoved.length - 30} more`);
  }
  if (!APPLY) {
    console.log('\nDry-run only. Re-run with --apply to move files.');
  }
}

main();
