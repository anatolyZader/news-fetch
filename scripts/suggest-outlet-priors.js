#!/usr/bin/env node
/**
 * Stub (N14): reads overrides JSONL + latest signals metadata and prints a suggested
 * `config/resilience-outlet-priors.json` shape. Does not write the file.
 *
 * Usage:
 *   node scripts/suggest-outlet-priors.js
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const overridesDir = resolve(process.cwd(), 'reports', 'overrides');
const signalsDir = resolve(process.cwd(), 'signals');

function listJsonlDates() {
  if (!existsSync(overridesDir)) return [];
  return readdirSync(overridesDir).filter((f) => f.endsWith('.jsonl')).map((f) => f.replace(/\.jsonl$/, ''));
}

function main() {
  const dates = listJsonlDates();
  const priors = {};
  for (const d of dates) {
    const p = resolve(overridesDir, `${d}.jsonl`);
    const lines = readFileSync(p, 'utf8').trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const o = JSON.parse(line);
        if (o.kind === 'dispute_evidence' && o.original?.article_source) {
          const src = o.original.article_source;
          priors[src] = { reliabilityMultiplier: 0.95, note: 'stub_from_disputes' };
        }
      } catch { /* ignore */ }
    }
  }

  const signalFiles = existsSync(signalsDir) ? readdirSync(signalsDir).filter((f) => f.startsWith('signals-news-')) : [];
  console.log(JSON.stringify({
    _comment: 'Suggested outlet priors (stub). Review before committing to config/resilience-outlet-priors.json',
    overrides_dates_seen: dates,
    signal_files_sample: signalFiles.slice(0, 5),
    suggested_priors: priors,
  }, null, 2));
}

main();
