/**
 * Shared orchestration: load markdown article files → extract signals → score → narratives → ready for writeReport.
 */

import { basename } from 'path';

import { loadMdFiles } from './mdReportsLoader.js';
import { extractSignals, generateNarratives } from './claudeEvaluator.js';
import { scoreComponents } from './behaviorSignals.js';

/**
 * @param {object} opts
 * @param {string[]} opts.filePaths   Absolute paths to articles-*.md
 * @param {string} [opts.reportDate]  YYYY-MM-DD (default from file header)
 * @param {'news'|'radio'} [opts.contentKind]
 * @param {boolean} [opts.dedupeTitles]  When true, drop duplicate titles (news cross-site); false for radio segments
 * @param {Function} [opts.onUsage]
 * @param {Array} [opts.priorReports]
 * @returns {Promise<{ assessment: object, signals: Array, articles: Array, totalCount: number }>}
 */
export async function runResilienceAnalysis({
  filePaths,
  reportDate: reportDateOpt,
  contentKind = 'news',
  dedupeTitles = true,
  onUsage,
  priorReports = [],
}) {
  const { articles: rawArticles, date: parsedDate, totalCount } = loadMdFiles(filePaths);
  const reportDate = reportDateOpt ?? parsedDate;

  let articles = rawArticles;
  if (dedupeTitles) {
    const _seen = new Set();
    articles = rawArticles.filter((a) => {
      const key = a.title.replace(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
      if (_seen.has(key)) return false;
      _seen.add(key);
      return true;
    });
  }

  const totalArticles = articles.length;

  const signals = await extractSignals(articles, { onUsage, contentKind });
  const scoredComponents = scoreComponents(signals, { totalArticles });
  const assessment = await generateNarratives(scoredComponents, signals, reportDate, totalArticles, {
    onUsage,
    priorReports,
    contentKind,
  });

  return {
    assessment,
    signals,
    articles,
    totalCount,
    reportDate,
    sourceFiles: filePaths.map((f) => basename(f)),
  };
}
