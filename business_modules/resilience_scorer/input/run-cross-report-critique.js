#!/usr/bin/env node
/**
 * CLI: cross-report critique — recurring weak/unsupported claims across N reports.
 *
 * Usage:
 *   node business_modules/resilience_scorer/input/run-cross-report-critique.js
 *   node business_modules/resilience_scorer/input/run-cross-report-critique.js --scope north --limit 6
 *   node business_modules/resilience_scorer/input/run-cross-report-critique.js --min-recurrence 3 --json
 *   node business_modules/resilience_scorer/input/run-cross-report-critique.js --produced-after 2026-07-24
 *
 * Read-only over reports; writes one artifact under data/critiques/.
 */
import {
  buildAndWriteCrossReportCritique,
  CRITIQUE_DEFAULTS,
} from '../app/assessment/crossReportCritiqueService.js';
import { getArg, hasFlag } from '../app/cliArgs.js';

function numArg(flag, fallback) {
  const raw = getArg(process.argv, flag);
  if (raw == null) return fallback;
  const v = Number(raw);
  return Number.isFinite(v) ? v : fallback;
}

const scope = getArg(process.argv, '--scope') ?? undefined;
const limit = numArg('--limit', 8);
/** Narrow to one build epoch when `render_epoch_spread` fires. */
const producedAfter = getArg(process.argv, '--produced-after') ?? undefined;
const thresholds = {
  ...CRITIQUE_DEFAULTS,
  minRecurrence: numArg('--min-recurrence', CRITIQUE_DEFAULTS.minRecurrence),
  claimSimilarity: numArg('--similarity', CRITIQUE_DEFAULTS.claimSimilarity),
  minSupportConfidence: numArg('--min-confidence', CRITIQUE_DEFAULTS.minSupportConfidence),
  minGroundingScore: numArg('--min-grounding', CRITIQUE_DEFAULTS.minGroundingScore),
};

try {
  const { artifactPath, payload } = buildAndWriteCrossReportCritique({
    scope,
    limit,
    producedAfter,
    thresholds,
  });

  if (hasFlag(process.argv, '--json')) {
    console.log(JSON.stringify(payload, null, 2));
    process.exit(0);
  }

  const { totals, date_range: range } = payload;
  console.log(`Cross-report critique — scope=${payload.scope} ${range.from} → ${range.to}`);
  const emptyBreakdown = totals.reports_without_claims > 0
    ? ` (${totals.reports_without_claims} with no claims: ${totals.reports_empty_failed} failed, `
      + `${totals.reports_empty_thin} thin)`
    : '';
  console.log(`  reports=${totals.reports}${emptyBreakdown} claims=${totals.claims}`);
  console.log(`  unsupported=${totals.unsupported_claims} thin_only=${totals.thin_only_claims} `
    + `structural_only=${totals.structural_only_claims} clean=${totals.clean_claims} `
    + `recurring_findings=${totals.recurring_findings}`);
  console.log(`  artifact: ${artifactPath}\n`);

  console.log('Top recurring weak claims:');
  for (const f of payload.recurring_weak_claims.slice(0, 10)) {
    console.log(`  [${f.recurrence} reports] ${f.components.join(',')} — ${f.exemplar_text.slice(0, 110)}`);
    console.log(`      persistent: ${f.persistent_weaknesses.join(', ') || 'none'}`
      + ` | unsupported in ${f.unsupported_in}/${f.occurrences}`);
  }
  if (payload.recurring_weak_claims.length === 0) {
    console.log('  (none above the recurrence threshold)');
  }

  for (const caveat of payload.caveats ?? []) {
    console.log(`\n! ${caveat.kind}: ${caveat.detail}`);
    console.log(`  affected: ${caveat.dates.join(', ')}`);
  }

  console.log('\nComponents by unsupported-claim share:');
  for (const c of payload.component_findings.slice(0, 8)) {
    const grounding = c.graded_reports > 0
      ? `median_grounding=${c.median_grounding_score} low=${c.low_grounding_reports}/${c.graded_reports}`
      : 'grounding=not computed';
    console.log(`  ${String(c.component_id).padEnd(26)} unsupported=${c.unsupported_claim_share} `
      + `weak=${c.weak_claim_share} ${grounding}`);
  }

  console.log('\nWeakness frequency (claim-level):');
  for (const w of payload.weakness_frequency) {
    console.log(`  ${w.key.padEnd(26)} ${w.count}/${totals.claims} claims`);
  }

  if (payload.structural_frequency?.length > 0) {
    console.log('\nStructural (one-source-by-nature material — recorded, not counted as weakness):');
    for (const w of payload.structural_frequency) {
      console.log(`  ${w.key.padEnd(26)} ${w.count}/${totals.claims} claims`);
    }
  }
} catch (err) {
  console.error('cross-report-critique failed:', err?.message ?? err);
  process.exit(1);
}
