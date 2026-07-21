/**
 * Single-article extraction trace CLI.
 *
 * Runs ONLY the closed catalogue extraction + decision trace on one attached
 * article. No source archiving, no retrieval/RAG, no open-pipeline second LLM,
 * and it does NOT write/overwrite the real signals bundle or touch the DB —
 * built for cheap, repeatable, one-by-one inspection of model reasoning.
 *
 * Usage:
 *   node trace-article.js --file <path> [--source-type news|radio|visits|whatsapp] [--date YYYY-MM-DD]
 *   node trace-article.js --text "<article text>" [--title T] [--source S] [--url U]
 *   [--all] trace every section of a multi-article file (default: first only)
 *   [--no-rationale] disable model rationale (B); A-only trace
 */
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

import { extractSignals } from '../../infrastructure/claudeEvaluator.js';
import { createCostTracker, checkDailyBudget } from '../../../../cross-cut-modules/budget/index.js';
import { createRunTrace } from '../../../../cross-cut-modules/log/index.js';
import {
  splitNumberedSections,
  parseSectionMeta,
} from '../../../../cross-cut-modules/markdown/markdownArticleSections.js';
import { CONTENT_KIND } from './contentKinds.js';
import { MAX_BODY_CHARS } from './contentBatchFromMdArticles.js';
import { getArg, hasFlag } from '../cliArgs.js';

const NUMBERED_SECTION_RE = /^##\s+\d+\.\s/m;

function deriveTitle(text) {
  const firstLine = String(text ?? '')
    .split('\n')
    .map((l) => l.trim())
    .find(Boolean);
  return firstLine ? firstLine.slice(0, 160) : 'Untitled article';
}

/**
 * Build article object(s) from raw input. Pure (no fs) so it is unit-testable.
 *
 * @param {{
 *   content: string,
 *   title?: string|null,
 *   source?: string|null,
 *   url?: string|null,
 *   date?: string|null,
 *   all?: boolean,
 * }} input
 * @returns {Array<object>}
 */
export function buildArticlesFromInput({ content, title = null, source = null, url = null, date = null, all = false } = {}) {
  const text = String(content ?? '');
  const publishedAt = date ?? new Date().toISOString().slice(0, 10);

  let parsed = [];
  if (NUMBERED_SECTION_RE.test(text)) {
    for (const section of splitNumberedSections(text)) {
      const meta = parseSectionMeta(section);
      if (meta) parsed.push(meta);
    }
  }

  if (parsed.length > 0) {
    const chosen = all ? parsed : parsed.slice(0, 1);
    return chosen.map((m) => ({
      title: title ?? m.title,
      url: url ?? m.url ?? '',
      publishedAt: m.publishedAt || publishedAt,
      source: source ?? m.source ?? 'manual',
      body: String(m.body ?? '').slice(0, MAX_BODY_CHARS),
      temporal_weight: 1,
    }));
  }

  const body = text.trim();
  return [{
    title: title ?? deriveTitle(body),
    url: url ?? '',
    publishedAt,
    source: source ?? 'manual',
    body: body.slice(0, MAX_BODY_CHARS),
    temporal_weight: 1,
  }];
}

function parseTraceArticleArgs(argv) {
  return {
    file: getArg(argv, '--file'),
    text: getArg(argv, '--text'),
    sourceType: getArg(argv, '--source-type') ?? 'news',
    date: getArg(argv, '--date') ?? new Date().toISOString().slice(0, 10),
    title: getArg(argv, '--title'),
    source: getArg(argv, '--source'),
    url: getArg(argv, '--url'),
    all: hasFlag(argv, '--all'),
    noRationale: hasFlag(argv, '--no-rationale'),
  };
}

function resolveInputContent({ file, text }) {
  if (text != null) return text;
  if (!file) {
    console.error('Error: provide --file <path> or --text "<article text>"');
    process.exit(1);
  }
  const fp = resolve(file);
  if (!existsSync(fp)) {
    console.error(`File not found: ${fp}`);
    process.exit(1);
  }
  return readFileSync(fp, 'utf-8');
}

function assertApiKey() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Error: ANTHROPIC_API_KEY is not set');
    process.exit(1);
  }
}

export async function runTraceArticleCli() {
  const cli = parseTraceArticleArgs(process.argv.slice(2));

  const contentKind = CONTENT_KIND[cli.sourceType];
  if (!contentKind) {
    console.error('Usage: trace-article.js --file <path> --source-type news|radio|visits|whatsapp [--date YYYY-MM-DD]');
    process.exit(1);
  }

  assertApiKey();
  checkDailyBudget();

  const content = resolveInputContent(cli);
  const articles = buildArticlesFromInput({
    content,
    title: cli.title,
    source: cli.source,
    url: cli.url,
    date: cli.date,
    all: cli.all,
  });

  // Rationale (B) on by default for this command (the point is to inspect reasoning).
  if (!cli.noRationale) process.env.RESILIENCE_EXTRACT_RATIONALE = '1';

  console.error(`\nSingle-article trace  source=${cli.sourceType}  kind=${contentKind}`);
  console.error('===================');
  console.error(`Articles: ${articles.length}  rationale(B): ${cli.noRationale ? 'off' : 'on'}\n`);

  const trace = createRunTrace({ run: 'trace-article', sourceType: cli.sourceType, date: cli.date, enabled: true });
  const { onUsage, printSummary } = createCostTracker({ label: 'trace-article' });

  const signals = await extractSignals(articles, {
    contentKind,
    onUsage,
    trace,
    retrievalService: null,
    reportDate: cli.date,
  });

  const out = trace.finish();
  console.error(`\n→ ${signals.length} signal(s) retained`);
  printSummary();
  if (out) {
    console.error('\nDecision trace written:');
    console.error(`  ${out.mdPath}`);
    console.error(`  ${out.jsonlPath}`);
  }
}
