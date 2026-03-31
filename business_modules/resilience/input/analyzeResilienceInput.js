/**
 * CLI: analyse daily news (or spoken-audio transcript) markdown for population resilience across 8 components.
 *
 * Options:
 *   --files  <f1.md,f2.md,...>   Comma-separated list of article MD files (default: articles-homefront.md)
 *   --date   <YYYY-MM-DD>        Override the report date (default: parsed from files).
 *   --output <path>              Output path without extension (default: reports/resilience-report-<date>-<time>).
 *   --content-kind news|audio    Default news. Audio uses transcript prompts and skips title dedupe.
 *   --no-dedupe                  Keep all sections even if titles match.
 */

import 'dotenv/config';
import { resolve, basename } from 'path';
import { existsSync, readFileSync, readdirSync } from 'fs';

import { loadMdFiles, loadMdFile } from '../infrastructure/mdReportsLoader.js';
import { scoreComponents } from '../domain/services/behaviorSignals.js';
import { createCostTracker, appendCostLog, checkDailyBudget } from '../../../cross-cut-modules/budget/index.js';

import { runResilienceAssessment } from '../app/resilienceAnalysisService.js';
import { contentBatchFromMdArticles } from '../app/contentBatchFromMdArticles.js';
import { createAnthropicResilienceLlmAdapter } from '../infrastructure/adapters/anthropicResilienceLlmAdapter.js';
import { createResilienceReportFsAdapter } from '../infrastructure/adapters/resilienceReportFsAdapter.js';

export async function runAnalyzeResilienceCli() {
  const args = process.argv.slice(2);
  const getArg = (flag) => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : null;
  };

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set. Add it to .env or the environment.');
    process.exit(1);
  }

  checkDailyBudget();

  const { onUsage, getTotal, printSummary } = createCostTracker({ label: 'analyze-resilience' });

  let filePaths;
  let dayOffsets;
  const filesArg = getArg('--files');
  if (filesArg) {
    filePaths = filesArg.split(',').map((f) => resolve(f.trim()));
    dayOffsets = filePaths.map(() => 0);
  } else {
    const baseFile = resolve('articles-homefront.md');
    filePaths = [baseFile];
    dayOffsets = [0];
    // Auto-include prior days' dated article files if they exist
    const baseDate = getArg('--date') ?? new Date().toISOString().slice(0, 10);
    for (let offset = 1; offset <= 2; offset++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() - offset);
      const priorDate = d.toISOString().slice(0, 10);
      const priorFile = resolve(`articles-homefront-${priorDate}.md`);
      if (existsSync(priorFile)) {
        filePaths.push(priorFile);
        dayOffsets.push(offset);
      }
    }
  }

  for (const fp of filePaths) {
    if (!existsSync(fp)) {
      console.error(`File not found: ${fp}`);
      process.exit(1);
    }
  }

  const contentKind = getArg('--content-kind') === 'audio' ? 'audio' : 'news';
  const explicitNoDedupe = args.includes('--no-dedupe');
  const dedupeTitles = explicitNoDedupe ? false : contentKind !== 'audio';

  // Optional field reports file — extracted separately with content_kind='field_report', fixed weight 0.75.
  // If --field-reports is not given explicitly, auto-detect the most recent articles-field-reports-*.md file
  // that contains at least one article (skips empty stub files).
  const fieldReportsArg = getArg('--field-reports') ?? (() => {
    const files = existsSync(resolve('.'))
      ? readdirSync(resolve('.')).filter((f) => /^articles-field-reports-\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse()
      : [];
    for (const f of files) {
      const { articles } = loadMdFile(resolve(f));
      if (articles.length > 0) return f;
    }
    return null;
  })();
  let supplementaryArticles = [];
  if (fieldReportsArg) {
    const frPath = resolve(fieldReportsArg);
    if (!existsSync(frPath)) {
      console.error(`Field reports file not found: ${frPath}`);
      process.exit(1);
    }
    const { articles: frArticles } = loadMdFile(frPath);
    supplementaryArticles = frArticles.map((a) => ({ ...a, temporal_weight: 0.75 }));
  }

  const reportDateArg = getArg('--date');
  const { articles: rawArticles, totalCount, date: parsedDate } = loadMdFiles(filePaths, { dayOffsets });
  const reportDateForPrior = reportDateArg ?? parsedDate;

  function loadPriorReports(date, n = 2) {
    const dir = resolve('reports');
    const allFiles = existsSync(dir) ? readdirSync(dir) : [];
    const priorReports = [];
    const d = new Date(date);
    for (let i = 1; i <= n; i++) {
      const prior = new Date(d);
      prior.setDate(d.getDate() - i);
      const priorDate = prior.toISOString().slice(0, 10);
      const matches = allFiles
        .filter((f) => f.startsWith(`resilience-report-${priorDate}`) && f.endsWith('.json'))
        .sort();
      const file = matches.at(-1);
      if (file) {
        try {
          const json = JSON.parse(readFileSync(resolve(dir, file), 'utf8'));
          priorReports.unshift(json.assessment);
        } catch {
          console.error(`  ⚠ Could not parse prior report: ${file}`);
        }
      }
    }
    return priorReports;
  }

  const priorReports = loadPriorReports(reportDateForPrior);

  const now = new Date();
  const timeSuffix = now.toTimeString().slice(0, 5).replace(':', '');

  const sourceFiles = filePaths.map((f) => basename(f));

  console.error(`\nResilience Analysis (${contentKind}${supplementaryArticles.length > 0 ? ' + field_report' : ''})`);
  console.error(`===================`);
  console.error(`Sources:  ${sourceFiles.map((f, i) => (dayOffsets[i] ? `${f} (T-${dayOffsets[i]}, w=${[1.00, 0.85, 0.70][dayOffsets[i]] ?? '?'})` : f)).join(', ')}`);
  if (supplementaryArticles.length > 0) {
    console.error(`Field reports: ${basename(fieldReportsArg)} (${supplementaryArticles.length} visits, w=0.75 fixed)`);
  }
  if (priorReports.length > 0) {
    console.error(`Prior context: ${priorReports.map((r) => r.date).join(', ')}\n`);
  } else {
    console.error(`Prior context: none found\n`);
  }

  try {
    const reportDate =
      reportDateArg ??
      (typeof parsedDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsedDate)
        ? parsedDate
        : new Date().toISOString().slice(0, 10));

    const batch = contentBatchFromMdArticles(rawArticles, {
      reportDate,
      contentKind,
      priorAssessments: priorReports,
    });

    const outputBase = getArg('--output')?.replace(/\.(md|json)$/, '')
      ?? resolve('reports', `resilience-report-${reportDate}-${timeSuffix}`);

    const { assessment, signals, provenance } = await runResilienceAssessment(batch, {
      llmPort: createAnthropicResilienceLlmAdapter(),
      reportWriterPort: createResilienceReportFsAdapter(),
      dedupeTitles,
      persist: true,
      outputBase,
      reportSourceFiles: sourceFiles,
      onUsage,
      supplementaryArticles,
      supplementaryContentKind: 'field_report',
    });

    const analyzedCount = provenance.itemCount;

    console.error(`Date:     ${reportDate}`);
    console.error(
      `Articles: ${analyzedCount} analyzed (${totalCount} in file${dedupeTitles ? `, ${totalCount - analyzedCount} deduped` : ''})`,
    );
    console.error(`Output:   ${outputBase}.(md|json)`);
    console.error('');

    const scoredComponents = scoreComponents(signals, { totalArticles: analyzedCount });
    console.error(`  → ${signals.length} total behavioral signals extracted\n`);
    for (const [id, c] of Object.entries(scoredComponents)) {
      const cert = c.certainty != null ? ` cert=${(c.certainty * 100).toFixed(0)}%` : '';
      console.error(`  → ${id.padEnd(28)} score=${c.score ?? 'n/a'} conf=${c.confidence}${cert} (${c.signal_count} signals)`);
    }
    console.error('');

    const mdPath = `${outputBase}.md`;
    const jsonPath = `${outputBase}.json`;

    console.error('\n=== Resilience Components ===');
    for (const comp of assessment.components ?? []) {
      console.error(`  ${comp.component_id.padEnd(28)} (${comp.confidence}, ${comp.signal_count ?? 0} signals)`);
    }
    console.error('');
    printSummary();
    console.error('');
    console.error('Reports written:');
    console.error(`  ${mdPath}`);
    console.error(`  ${jsonPath}`);

    const { totalCostUsd, usageLog } = getTotal();
    appendCostLog({
      script: contentKind === 'audio' ? 'analyze-audio' : 'analyze-resilience',
      date: reportDate,
      totalCostUsd,
      usageLog,
      articles: analyzedCount,
    });
  } catch (err) {
    console.error('\nAnalysis failed:', err.message);
    if (err.status) console.error('API status:', err.status);
    process.exit(1);
  }
}
