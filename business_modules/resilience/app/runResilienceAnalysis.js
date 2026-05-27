/**
 * Shared orchestration: load markdown article files → extract signals → score → narratives → ready for writeReport.
 */

import { basename } from 'node:path';
import { existsSync } from 'node:fs';

import { loadMdFiles } from '../infrastructure/mdReportsLoader.js';
import { extractSignals, generateNarratives } from '../infrastructure/claudeEvaluator.js';
import { scoreComponents } from '../domain/services/behaviorSignals.js';
import {
  computeDataVoidIndex,
  applyEpistemicGate,
  attachEpistemicToAssessment,
} from '../domain/services/dataVoidIndex.js';
import { salienceContextFromDataVoid } from '../domain/services/highSalienceBypass.js';
import { loadHistoricalSignalDays } from '../input/assessSignalsHelpers.js';
import { loadConnectivityProbeSignals } from '../infrastructure/adapters/connectivityProbeFileAdapter.js';

/**
 * @param {object} opts
 * @param {string[]} opts.filePaths   Absolute paths to articles-*.md
 * @param {string} [opts.reportDate]  YYYY-MM-DD (default from file header)
 * @param {'news'|'audio'} [opts.contentKind]
 * @param {boolean} [opts.dedupeTitles]  When true, drop duplicate titles (news cross-site); false for audio transcript segments
 * @param {Function} [opts.onUsage]
 * @param {Array} [opts.priorReports]
 * @param {string} [opts.reportsDir]
 * @returns {Promise<{ assessment: object, signals: Array, articles: Array, totalCount: number }>}
 */
export async function runResilienceAnalysis({
  filePaths,
  reportDate: reportDateOpt,
  contentKind = 'news',
  dedupeTitles = true,
  onUsage,
  priorReports = [],
  reportsDir = 'reports',
}) {
  const { articles: rawArticles, date: parsedDate, totalCount } = loadMdFiles(filePaths);
  const reportDate = reportDateOpt ?? parsedDate;

  let articles = rawArticles;
  if (dedupeTitles) {
    const _seen = new Set();
    articles = rawArticles.filter((a) => {
      const key = a.title.replaceAll(/[^\u0590-\u05FF\w]/g, '').slice(0, 40);
      if (_seen.has(key)) return false;
      _seen.add(key);
      return true;
    });
  }

  const totalArticles = articles.length;

  let signals = await extractSignals(articles, { onUsage, contentKind });
  const probeSignals = loadConnectivityProbeSignals(reportDate, 'national');
  if (probeSignals.length > 0) {
    signals = [...signals, ...probeSignals];
  }

  const hasReportsDir = existsSync(reportsDir);
  const historicalSignalDays = hasReportsDir
    ? loadHistoricalSignalDays(reportDate, reportsDir, 7, 'national')
    : [];

  const voidStatus = hasReportsDir ? 'active' : 'unavailable';
  const dataVoid = computeDataVoidIndex(signals, historicalSignalDays, {
    reportScope: 'national',
    voidStatus,
  });

  let salienceContext = salienceContextFromDataVoid(dataVoid);
  const digitalInclusiveScored = scoreComponents(signals, {
    totalArticles,
    salienceContext,
  });

  const gateResult = applyEpistemicGate({
    scoredFull: digitalInclusiveScored,
    signalsForScoring: signals,
    dataVoid,
    totalArticles,
    salienceContext,
    digitalInclusiveScored,
  });

  const assessment = await generateNarratives(gateResult.scoredFull, signals, reportDate, totalArticles, {
    onUsage,
    priorReports,
    contentKind,
    dataVoid,
    salienceContext: gateResult.salienceContext,
  });

  attachEpistemicToAssessment(assessment, {
    dataVoid,
    epistemicStatus: gateResult.epistemicStatus,
    assessmentMode: gateResult.assessmentMode,
    staleDigitalScores: gateResult.staleDigitalScores,
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
