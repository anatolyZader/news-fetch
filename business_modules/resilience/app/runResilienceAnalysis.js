/**
 * Shared orchestration: load markdown article files → extract signals → score → assess → ready for writeReport.
 */

import { basename } from 'node:path';
import { existsSync } from 'node:fs';

import { loadMdFiles } from '../infrastructure/mdReportsLoader.js';
import { extractSignals } from '../infrastructure/claudeEvaluator.js';
import {
  attachEpistemicToAssessment,
} from '../domain/services/dataVoidIndex.js';
import { salienceContextFromDataVoid } from '../domain/services/highSalienceBypass.js';
import { loadHistoricalScores } from '../input/assessSignalsHelpers.js';
import { summarizeValidationMaturity } from '../validation/domain/validationStatus.js';
import { loadConnectivityProbeSignals } from '../infrastructure/adapters/connectivityProbeFileAdapter.js';
import { enrichProbeSignalsInList } from '../domain/services/probeCorroborationPolicy.js';
import { runScoringPipeline } from './scoringPipelinePrep.js';
import { prepareScoringSignals } from './prepareScoringSignals.js';
import { produceAssessmentWithShadow } from './produceAssessmentWithShadow.js';

/**
 * @param {object} opts
 * @param {string[]} opts.filePaths   Absolute paths to articles-*.md
 * @param {string} [opts.reportDate]  YYYY-MM-DD (default from file header)
 * @param {'news'|'audio'} [opts.contentKind]
 * @param {boolean} [opts.dedupeTitles]  When true, drop duplicate titles (news cross-site); false for audio transcript segments
 * @param {Function} [opts.onUsage]
 * @param {Array} [opts.priorReports]
 * @param {string} [opts.reportsDir]
 * @param {boolean} [opts.dailyBudgetExceeded]
 * @returns {Promise<{ assessment: object, signals: Array, articles: Array, totalCount: number }>}
 */
export async function runResilienceAnalysis({
  filePaths,
  reportDate: reportDateOpt,
  contentKind = 'news',
  dedupeTitles = true,
  onUsage,
  priorReports: _priorReports = [],
  reportsDir = 'daily_reports',
  dailyBudgetExceeded = false,
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
  signals = enrichProbeSignalsInList(signals);

  const hasReportsDir = existsSync(reportsDir);
  const historicalScores = hasReportsDir
    ? loadHistoricalScores(reportDate, reportsDir, 14, 'national')
    : {};

  const voidStatus = hasReportsDir ? 'active' : 'unavailable';
  const prepared = await prepareScoringSignals({
    signalsForScoring: signals,
    reportDate,
    reportScopeId: 'national',
    reportsDir,
    digitalDarknessHint: false,
  });

  if (voidStatus === 'unavailable') {
    prepared.dataVoid.void_status = 'unavailable';
  }

  const dataVoid = prepared.dataVoid;
  const salienceContext = salienceContextFromDataVoid(dataVoid);
  const validationMaturity = summarizeValidationMaturity({ rootDir: reportsDir });

  const pipelineResult = runScoringPipeline({
    signalsForScoring: prepared.signalsForScoring,
    dataVoid,
    totalArticles,
    mediaSignals: signals,
    salienceContext,
    historicalScores,
    scopeId: 'national',
    validationMaturity,
    priorQuarantine: prepared.priorQuarantine,
    reportDate,
  });

  signals = pipelineResult.scoringSignals;

  const assessment = await produceAssessmentWithShadow({
    targetDate: reportDate,
    reportScopeId: 'national',
    signalsForScoring: signals,
    scopedSignals: signals,
    scoredFull: pipelineResult.scoredFull,
    scopedTotalArticles: totalArticles,
    dataVoid,
    assessmentMode: pipelineResult.assessmentMode,
    epistemicStatus: pipelineResult.epistemicStatus,
    onUsage,
    reportsDir,
    oovBurst: prepared.oovBurst ?? null,
    dailyBudgetExceeded,
  });

  attachEpistemicToAssessment(assessment, {
    dataVoid,
    epistemicStatus: pipelineResult.epistemicStatus,
    assessmentMode: pipelineResult.assessmentMode,
    staleDigitalScores: pipelineResult.staleDigitalScores,
    quarantinedDigital: pipelineResult.quarantinedDigital,
    digitalQuarantineState: pipelineResult.digitalQuarantineState,
  });

  assessment.oov_burst = prepared.oovBurst;
  if (prepared.oovScoringApplied) {
    assessment.oov_scoring_applied = prepared.oovScoringApplied;
  }

  if (pipelineResult.epistemicEnrichment.overall_score_calibrated != null) {
    assessment.overall_score_calibrated = pipelineResult.epistemicEnrichment.overall_score_calibrated;
  }

  return {
    assessment,
    signals,
    articles,
    totalCount,
    reportDate,
    sourceFiles: filePaths.map((f) => basename(f)),
  };
}
