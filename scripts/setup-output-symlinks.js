#!/usr/bin/env node
/**
 * Create output/ symlink tree (Option A: centralized view, module-owned storage).
 *
 * Usage:
 *   node scripts/setup-output-symlinks.js
 *   npm run output:setup
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readlinkSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_ROOT = resolve(REPO_ROOT, 'output');

/** @type {Array<{ link: string, target: string, description?: string }>} */
export const OUTPUT_SYMLINKS = [
  // Production — pipeline outputs
  { link: 'production/assessment-reports', target: 'business_modules/resilience_scorer/data/daily_reports' },
  { link: 'production/closed-signals', target: 'business_modules/resilience_scorer/data/signals' },
  { link: 'production/open-observations', target: 'business_modules/open_observation_extraction/data' },
  { link: 'production/oov-captures', target: 'business_modules/resilience_scorer/data/oov_captures' },
  { link: 'production/omission-audits', target: 'business_modules/resilience_scorer/data/omission_audits' },
  { link: 'production/epistemic-profiles', target: 'business_modules/resilience_scorer/data/epistemic_profiles' },
  { link: 'production/survey-reports', target: 'business_modules/resilience_scorer/data/survey' },
  { link: 'production/agent-traces', target: 'business_modules/specialist_agents/data/traces' },
  { link: 'production/agent-eval', target: 'business_modules/specialist_agents/data/eval' },

  // Production — ingest (source MD / module exports before or alongside extract)
  { link: 'production/ingest/news-articles', target: 'business_modules/news-sites/articles_extracted' },
  { link: 'production/ingest/whatsapp-reports', target: 'business_modules/whatsapp/reports' },
  { link: 'production/ingest/field-visits', target: 'business_modules/visits/data' },
  { link: 'production/ingest/pbo-muni', target: 'business_modules/pbo_report_muni/data' },
  { link: 'production/ingest/pbo-regional', target: 'business_modules/pbo_report_regional/data' },
  { link: 'production/ingest/social-media', target: 'business_modules/social_media/data' },

  // Research / calibration (not operator daily path)
  { link: 'research/analyst-shadow', target: 'analyst/data/shadow' },
  { link: 'research/analyst-reviews', target: 'analyst/data/reviews' },
  { link: 'research/signal-catalog', target: 'business_modules/signal_catalog_evolution/data' },
  { link: 'research/translation-locale', target: 'business_modules/translation/data/locale' },

  // Operational (verbose logs, cost — separate lifecycle from assessment artifacts)
  { link: 'operational/logs', target: 'logs' },
  { link: 'operational/cost', target: 'cross-cut-modules/log/data' },
];

function ensureSymlink(linkAbs, targetAbs) {
  const relTarget = relative(dirname(linkAbs), targetAbs);
  if (existsSync(linkAbs)) {
    const stat = lstatSync(linkAbs);
    if (stat.isSymbolicLink()) {
      const resolved = resolve(dirname(linkAbs), readlinkSync(linkAbs));
      if (resolved === targetAbs) {
        return 'ok';
      }
      unlinkSync(linkAbs);
    } else {
      throw new Error(`${linkAbs} exists and is not a symlink`);
    }
  }
  mkdirSync(dirname(linkAbs), { recursive: true });
  symlinkSync(relTarget, linkAbs);
  return 'created';
}

function main() {
  let created = 0;
  let ok = 0;

  for (const { link, target } of OUTPUT_SYMLINKS) {
    const linkAbs = resolve(OUTPUT_ROOT, link);
    const targetAbs = resolve(REPO_ROOT, target);
    mkdirSync(targetAbs, { recursive: true });
    const result = ensureSymlink(linkAbs, targetAbs);
    if (result === 'created') {
      created += 1;
      console.log(`+ ${link} -> ${target}`);
    } else {
      ok += 1;
    }
  }

  console.log(`output/ symlinks: ${created} created, ${ok} already correct`);
}

main();
