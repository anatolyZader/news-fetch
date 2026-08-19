#!/usr/bin/env node
/**
 * Post-run audit digest for north/national pipeline replays.
 *
 * Usage:
 *   npm run pipeline:audit -- --date 2026-04-10 --scope north
 */
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resilienceReportsDir, resilienceAuditsDir, resolveReportJsonPathForDate, divergenceArtifactPath } from '../index.js';
import { getArg as getArgFrom } from '../app/cliArgs.js';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));

const getArg = (name) => getArgFrom(process.argv, name);

function loadJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function latestReportJson(date, scope) {
  return resolveReportJsonPathForDate(date, {
    reportsDir: resilienceReportsDir(ROOT),
    scope,
  });
}

function tailLogErrors(logPath, lines = 40) {
  if (!existsSync(logPath)) return { path: logPath, present: false, warnings: [] };
  const content = readFileSync(logPath, 'utf8').split('\n');
  const tail = content.slice(-lines);
  const warnings = tail.filter((l) => /⚠|failed|Cost cap|run-pipeline failed/i.test(l));
  return { path: logPath, present: true, warnings };
}

const date = getArg('--date');
const scope = getArg('--scope') ?? 'north';

if (!date) {
  console.error('Usage: pipeline-run-audit.js --date YYYY-MM-DD [--scope north|national]');
  process.exit(1);
}

const tokenPath = join(ROOT, 'cross-cut-modules/budget/resilience_analysis', `token-report-${date}-${scope}.json`);
const token = loadJson(tokenPath);

const logName = scope === 'north' ? `pipeline-run-north-${date}.log` : `pipeline-run-${date}.log`;
const logAudit = tailLogErrors(join(ROOT, 'logs', logName));

const reportPath = latestReportJson(date, scope);
const report = reportPath ? loadJson(reportPath) : null;
const assessment = report?.assessment ?? null;

const omissionPath = join(resilienceAuditsDir(ROOT), `omission-audit-${scope}-${date}.json`);
const omission = loadJson(omissionPath);

const validationPath = join(
  ROOT,
  'business_modules/resilience_scorer/validation/artifacts/records',
  `${date}-${scope}.json`,
);
const validation = loadJson(validationPath);

const divergencePath = divergenceArtifactPath(scope, date, ROOT);
const divergence = loadJson(divergencePath);

console.log(`\n=== Pipeline audit: ${date} (${scope}) ===\n`);

if (token) {
  console.log(
    `Token: ${Math.round(token.durationMs / 60000 * 10) / 10} min, `
    + `LLM $${Number(token.summary?.costUsd ?? 0).toFixed(4)}, `
    + `pipeline $${Number(token.pipeline?.totalCostUsd ?? 0).toFixed(4)}`,
  );
  const top = Object.entries(token.byFeature ?? {})
    .sort((a, b) => (b[1]?.costUsd ?? 0) - (a[1]?.costUsd ?? 0))
    .slice(0, 5)
    .map(([k, v]) => `${k}:$${Number(v.costUsd).toFixed(4)}`);
  if (top.length) console.log(`  top features: ${top.join(', ')}`);
  if (token.narrativePromptBudget) {
    const nb = token.narrativePromptBudget;
    console.log(
      `  narrative budget: degrade_level=${nb.max_level_used ?? 'n/a'}, `
      + `preflight_calls=${nb.invocations_with_budget ?? 0}`,
    );
  }
} else {
  console.log(`Token report: missing (${tokenPath})`);
}

if (reportPath) {
  console.log(`Report: ${reportPath}`);
  console.log(`  generated_at: ${report?.generated_at ?? 'n/a'}`);
  console.log(`  signals: ${report?.signals?.length ?? 'n/a'}`);
  const inv = assessment?.investigation_summary ?? {};
  console.log(
    `  agent_ran: ${inv.agent_ran ?? 'n/a'}, `
    + `scoring_mode: ${inv.scoring_assessment_mode ?? assessment?.assessment_mode ?? 'n/a'}`,
  );
  const grounding = assessment?.narrative_grounding_summary;
  if (grounding) {
    console.log(
      `  narrative_grounding: mean=${grounding.mean_score}, `
      + `below_threshold=${(grounding.components_below_threshold ?? []).length}`,
    );
  }
  if (assessment?.narrative_pipeline_degraded) {
    console.log(`  ⚠ narrative_pipeline_degraded: ${(assessment.narrative_pipeline_degrade_reasons ?? []).join('; ')}`);
  }
  if (assessment?.narrative_scope_repairs?.length) {
    console.log(
      `  narrative_scope_repairs: ${assessment.narrative_scope_repairs.join(', ')} `
      + '(prose re-asked and kept, not degraded)',
    );
  }
  if (assessment?.narrative_prompt_budget) {
    const pb = assessment.narrative_prompt_budget;
    console.log(
      `  narrative_prompt_budget: level=${pb.degrade_level ?? 'n/a'}, `
      + `digest_cap=${pb.digest_cap ?? 'n/a'}, registry=${pb.registry_count ?? 'n/a'}`,
    );
  }
  const shadowEp = assessment?.shadow_scoring?.epistemic_status;
  if (shadowEp) {
    console.log(
      `  score_epistemic: void_level=${shadowEp.void_level}, `
      + `mode=${shadowEp.assessment_mode}, reliable=${shadowEp.scores_reliable}`,
    );
  }
  const oaSummary = assessment?.omission_audit_summary;
  if (oaSummary) {
    console.log(
      `  omission_audit_summary: zero_signal=${oaSummary.zero_signal_article_count}, `
      + `residual=${oaSummary.residual_observation_count}`,
    );
  }
} else {
  console.log('Report JSON: not found');
}

if (omission) {
  console.log(
    `Omission audit: zero-signal=${omission.zero_signal_article_count}, `
    + `residual=${omission.residual_observation_count}`,
  );
}

if (validation) {
  const rq = validation.review_queue_summary ?? {};
  console.log(
    `Validation: phase=${validation.operational_phase}, review_items=${rq.item_count ?? 0}`,
  );
  if (validation.elevation_advisory?.message) {
    console.log(`  ⚠ ${validation.elevation_advisory.message}`);
  }
}

if (divergence) {
  const stale = report?.generated_at && divergence.generated_at < report.generated_at;
  console.log(
    `Divergence: mode=${divergence.mode ?? 'agent_shadow'}, `
    + `alignment=${divergence.alignment_rate ?? 'n/a'}, `
    + `generated_at=${divergence.generated_at ?? 'n/a'}${stale ? ' (STALE vs report)' : ''}`,
  );
} else {
  console.log('Divergence artifact: not found');
}

if (logAudit.present) {
  console.log(`\nLog warnings (${logAudit.path}, last ${logAudit.warnings.length}):`);
  for (const w of logAudit.warnings.slice(-8)) console.log(`  ${w}`);
} else {
  console.log(`\nPipeline log: missing (${logAudit.path})`);
}

console.log('');
