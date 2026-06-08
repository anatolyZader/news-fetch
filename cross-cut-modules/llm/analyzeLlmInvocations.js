/**
 * Analyze llm-invocations.jsonl for prompt-cache and tool-loop health.
 */
import { readJsonlRecords } from '../log/infrastructure/jsonlLog.js';
import { resolveLlmInvocationsPath } from './llmInvocationLog.js';
import { llmPromptCacheMasterEnabled } from './promptCacheConfig.js';

const TOOL_LOOP_FEATURES = new Set([
  'chat',
  'planner',
  'synthesizer',
  'specialist',
  'validation',
  'assess_planner',
  'assess_specialist',
  'assess_synth',
  'assessment_planner',
  'assessment_specialist',
  'assessment_synthesizer',
]);

const ROUND_PURPOSE_RE = /:round-(\d+)$/;

/**
 * @param {string} [purpose]
 * @returns {number|null}
 */
export function parseToolLoopRound(purpose) {
  const m = String(purpose ?? '').match(ROUND_PURPOSE_RE);
  if (!m) return null;
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {object} row
 * @param {Record<string, object>} byFeature
 */
function accumulateInvocationRow(row, byFeature) {
  const feature = row.feature ?? 'unknown';
  if (!byFeature[feature]) {
    byFeature[feature] = {
      count: 0,
      cachedReadTotal: 0,
      cacheCreationTotal: 0,
      promptCacheAppliedCount: 0,
      rounds: {},
      purposes: new Set(),
    };
  }
  const bucket = byFeature[feature];
  bucket.count += 1;
  bucket.cachedReadTotal += row.cachedInputTokens ?? 0;
  bucket.cacheCreationTotal += row.cacheCreationTokens ?? 0;
  if (row.promptCacheApplied === true) bucket.promptCacheAppliedCount += 1;

  const purpose = row.purpose ?? '';
  if (purpose) bucket.purposes.add(purpose);

  const round = parseToolLoopRound(purpose);
  if (round == null) return;

  if (!bucket.rounds[round]) {
    bucket.rounds[round] = { count: 0, cachedRead: 0, cacheCreation: 0 };
  }
  bucket.rounds[round].count += 1;
  bucket.rounds[round].cachedRead += row.cachedInputTokens ?? 0;
  bucket.rounds[round].cacheCreation += row.cacheCreationTokens ?? 0;
}

/**
 * @param {string} feature
 * @param {object} stats
 * @param {string[]} issues
 * @param {string[]} warnings
 */
function auditToolLoopCache(feature, stats, issues, warnings) {
  const roundNums = Object.keys(stats.rounds).map(Number).sort((a, b) => a - b);
  if (roundNums.length === 0) return;

  const round1Plus = roundNums.filter((r) => r >= 1);
  const round1PlusCached = round1Plus.filter((r) => stats.rounds[r].cachedRead > 0);
  const round0Creation = stats.rounds[0]?.cacheCreation ?? 0;

  if (!llmPromptCacheMasterEnabled() || !TOOL_LOOP_FEATURES.has(feature)) return;

  if (round1Plus.length > 0 && round1PlusCached.length === 0 && round0Creation === 0) {
    warnings.push(
      `${feature}: tool rounds 1+ (${round1Plus.join(',')}) have no cachedInputTokens and round-0 had no cacheCreation — cache may be off or prompts too short`,
    );
  }
  if (round1Plus.length > 0 && round1PlusCached.length === 0 && round0Creation > 0) {
    issues.push(
      `${feature}: cache was created on round-0 but rounds 1+ show zero cache reads`,
    );
  }
}

/**
 * @param {object[]} rows
 */
export function analyzeLlmInvocations(rows) {
  const byFeature = {};
  const issues = [];
  const warnings = [];

  for (const row of rows) {
    accumulateInvocationRow(row, byFeature);
  }

  for (const [feature, stats] of Object.entries(byFeature)) {
    stats.purposes = [...stats.purposes];
    auditToolLoopCache(feature, stats, issues, warnings);
  }

  return {
    invocation_count: rows.length,
    by_feature: byFeature,
    issues,
    warnings,
    ok: issues.length === 0,
  };
}

/**
 * @param {string} datePrefix YYYY-MM-DD
 * @param {string} [rootDir]
 */
export function readInvocationsForDate(datePrefix, rootDir) {
  const path = resolveLlmInvocationsPath(rootDir);
  return readJsonlRecords(path).filter((row) => row.timestamp?.startsWith(datePrefix));
}

/**
 * @param {string} datePrefix
 * @param {string} [rootDir]
 */
export function analyzeLlmInvocationsForDate(datePrefix, rootDir) {
  return analyzeLlmInvocations(readInvocationsForDate(datePrefix, rootDir));
}

/**
 * @param {ReturnType<typeof analyzeLlmInvocations>} report
 */
export function formatAnalysisReport(report) {
  const lines = [
    `LLM invocation analysis (${report.invocation_count} rows)`,
    '',
  ];

  for (const [feature, stats] of Object.entries(report.by_feature).sort((a, b) => a[0].localeCompare(b[0]))) {
    const rounds = Object.entries(stats.rounds)
      .sort(([a], [b]) => Number(a) - Number(b))
      .map(([r, s]) => `round-${r}: n=${s.count} cached=${s.cachedRead} created=${s.cacheCreation}`)
      .join('; ');
    lines.push(
      `  ${feature.padEnd(22)} n=${String(stats.count).padStart(4)}  ` +
      `cache_read=${String(stats.cachedReadTotal).padStart(6)}  ` +
      `cache_write=${String(stats.cacheCreationTotal).padStart(5)}  ` +
      `promptCacheApplied=${stats.promptCacheAppliedCount}` +
      (rounds ? `\n    ${rounds}` : ''),
    );
  }

  if (report.warnings.length) {
    lines.push('', 'Warnings:');
    for (const w of report.warnings) lines.push(`  ⚠ ${w}`);
  }
  if (report.issues.length) {
    lines.push('', 'Issues:');
    for (const i of report.issues) lines.push(`  ✗ ${i}`);
  }
  lines.push('', report.ok ? 'Status: PASS' : 'Status: FAIL');
  return lines.join('\n');
}
