/**
 * Token / cost audit CLI (dev): runs news resilience extract+synthesize with per-call usage logging.
 * Cross-cutting budget tooling — not part of the resilience business module boundary.
 */
import 'dotenv/config';
import { resolve, isAbsolute } from 'node:path';
import { existsSync as fsExists } from 'node:fs';

import { loadMdFiles } from '../../../business_modules/resilience_scorer/index.js';
import { extractEvidence } from '../../../business_modules/resilience_scorer/index.js';
import { buildComponentEvidence } from '../../../business_modules/resilience_scorer/index.js';
import { createEpistemicFeaturesService } from '../../../business_modules/resilience_scorer/index.js';
import { runDeterministicAssessment } from '../../../business_modules/specialist_agents/index.js';
import { getTodayInTimezone } from '../../../utils/dateUtils.js';
import { PRICING, calcInvocationCostUsd } from '../app/budgetCostTracker.js';

const MAX_COST_USD = 2;

function ratio(used, total) {
  if (!total) return 'n/a';
  return `${((used / total) * 100).toFixed(1)}%`;
}

function fmtEntry(e) {
  const inputEfficiency = e.usage.output_tokens
    ? ratio(e.usage.output_tokens, e.usage.input_tokens)
    : '—';
  return (
    `  ${e.label.padEnd(38)}` +
    `  in: ${String(e.usage.input_tokens).padStart(7)}` +
    `  out: ${String(e.usage.output_tokens).padStart(6)}` +
    `  out/in: ${inputEfficiency.padStart(6)}` +
    `  cost: $${e.cost.toFixed(4)}`
  );
}

export async function runTestTokenUsageCli() {
  const usageLog = [];
  let totalCostUsd = 0;

  function printSummary(assessmentOrNull) {
    const divider = '═'.repeat(90);
    const line    = '─'.repeat(90);
    console.error(`\n${divider}`);
    console.error('TOKEN USAGE BREAKDOWN');
    console.error(divider);
    console.error(
      `  ${'Step'.padEnd(38)}` +
      `  ${'Input'.padStart(10)}` +
      `  ${'Output'.padStart(9)}` +
      `  ${'Out/In'.padStart(9)}` +
      `  ${'Cost'.padStart(10)}`
    );
    console.error(line);

    for (const e of usageLog) console.error(fmtEntry(e));

    const totalIn  = usageLog.reduce((s, e) => s + e.usage.input_tokens,  0);
    const totalOut = usageLog.reduce((s, e) => s + e.usage.output_tokens, 0);

    console.error(line);
    console.error(
      `  ${'TOTAL'.padEnd(38)}` +
      `  ${String(totalIn).padStart(10)}` +
      `  ${String(totalOut).padStart(9)}` +
      `  ${ratio(totalOut, totalIn).padStart(9)}` +
      `  $${totalCostUsd.toFixed(4).padStart(9)}`
    );
    console.error(divider);

    const models = [...new Set(usageLog.map((e) => e.model))];
    for (const model of models) {
      const entries = usageLog.filter((e) => e.model === model);
      const mIn  = entries.reduce((s, e) => s + e.usage.input_tokens,  0);
      const mOut = entries.reduce((s, e) => s + e.usage.output_tokens, 0);
      const mCost = entries.reduce((s, e) => s + e.cost, 0);
      console.error(`  ${model.padEnd(38)}  in: ${String(mIn).padStart(7)}  out: ${String(mOut).padStart(6)}  cost: $${mCost.toFixed(4)}`);
    }
    console.error(divider);

    console.error(`\n💰  TOTAL COST: $${totalCostUsd.toFixed(4)}  (Haiku: $${usageLog.filter(e=>e.model.includes('haiku')).reduce((s,e)=>s+e.cost,0).toFixed(4)}  |  Opus: $${usageLog.filter(e=>e.model.includes('opus')).reduce((s,e)=>s+e.cost,0).toFixed(4)})`);

    console.error('\nEFFICIENCY NOTES');
    for (const e of usageLog) {
      const r = e.usage.input_tokens ? e.usage.output_tokens / e.usage.input_tokens : 0;
      if (r < 0.05) {
        console.error(`  ⚠ ${e.label}: output/input ratio ${(r * 100).toFixed(1)}% — most input tokens produced little output`);
      }
    }

    if (assessmentOrNull) {
      console.error('\nCOMPONENT SCORES');
      for (const comp of assessmentOrNull.components ?? []) {
        console.error(`  ${comp.component_id.padEnd(30)} ${comp.score}/10  (${comp.confidence})`);
      }
      console.error(`  ${'OVERALL'.padEnd(30)} ${assessmentOrNull.overall_resilience_score}/10`);
    }

    console.error(`\n${divider}\n`);
  }

  function onUsage({ label, model, usage }) {
    const cost = calcInvocationCostUsd(model, usage);
    totalCostUsd += cost;
    usageLog.push({ label, model, usage, cost });

    console.error(fmtEntry({ label, model, usage, cost }));

    if (totalCostUsd > MAX_COST_USD) {
      console.error(`\n🛑  Cost threshold $${MAX_COST_USD} exceeded (running total: $${totalCostUsd.toFixed(4)})`);
      console.error('    Breaking early — printing interim results.\n');
      printSummary(null);
      process.exit(1);
    }
  }

  const timezone = process.env.TZ_ARTICLES || 'Asia/Jerusalem';
  const date = process.argv[2] || getTodayInTimezone(timezone);

  const homefront = (process.env.HOMEFRONT_MD || 'articles-homefront.md').trim();
  const homefrontPath = isAbsolute(homefront) ? homefront : resolve(homefront);
  const candidates = fsExists(homefrontPath) ? [homefrontPath] : [];

  if (candidates.length === 0) {
    console.error('No article files found. Run: npm run homefront-to-md');
    process.exit(1);
  }

  const { articles: rawArticles, totalCount } = loadMdFiles(candidates);

  const _seen = new Set();
  const articles = rawArticles.filter((a) => {
    const key = a.title.replaceAll(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
    if (_seen.has(key)) return false;
    _seen.add(key);
    return true;
  });

  const divider = '═'.repeat(90);
  console.error(`\n${divider}`);
  console.error(`TOKEN USAGE TEST  —  ${date}`);
  console.error(divider);
  console.error(`Articles:       ${articles.length} unique  (${totalCount} total, ${totalCount - articles.length} cross-site dupes removed)`);
  console.error(`Source files:   ${candidates.map((f) => f.split('/').pop()).join(', ')}`);
  console.error(`Cost threshold: $${MAX_COST_USD}  (breaks early if exceeded)`);
  console.error(`Pricing:        Haiku $${PRICING['claude-haiku-4-5-20251001'].input}/$${PRICING['claude-haiku-4-5-20251001'].output} per MTok  |  Opus $${PRICING['claude-opus-4-6'].input}/$${PRICING['claude-opus-4-6'].output} per MTok`);
  console.error(divider);
  console.error(`\n  ${'Step'.padEnd(38)}  ${'Input'.padStart(10)}  ${'Output'.padStart(9)}  ${'Out/In'.padStart(9)}  ${'Cost'.padStart(10)}`);
  console.error('─'.repeat(90));

  try {
    const evidenceSnippets = await extractEvidence(articles, { onUsage });
    console.error(`\n  → ${evidenceSnippets.length} evidence snippets extracted\n`);

    const scored = buildComponentEvidence(evidenceSnippets, { totalArticles: articles.length });
    const epistemicService = createEpistemicFeaturesService({});
    const epistemicProfile = epistemicService.computeProfile(evidenceSnippets, {
      totalArticles: articles.length,
      reportDate: date,
      scoredComponents: scored,
    });
    await runDeterministicAssessment({
      signals: evidenceSnippets,
      epistemicProfile,
      reportDate: date,
      scoredComponents: scored,
      degradeReason: 'forced_deterministic',
    });

    const scores = Object.values(scored).map((s) => s.score).filter((n) => typeof n === 'number');
    const assessmentForSummary = {
      components: Object.entries(scored).map(([component_id, s]) => ({
        component_id,
        score: s.score,
        confidence: s.confidence,
      })),
      overall_resilience_score: scores.length
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10
        : null,
    };

    printSummary(assessmentForSummary);
  } catch (err) {
    if (!err.message?.includes('threshold')) {
      console.error('\nAnalysis failed:', err.message);
      printSummary(null);
    }
    process.exit(1);
  }
}
