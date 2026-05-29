/**
 * Build the system prompt context from a resilience report.
 */
import { buildPboIndex } from './pboIndex.js';
import { listReportDates, listSignalMeta } from './signalLookup.js';
import {
  deriveInstrumentState,
  operatorAssessmentSummary,
  DISPLAY_VIEWS,
} from '../../resilience/domain/services/assessmentDisplayTier.js';

function formatComponentBlock(c, { includeScores }) {
  const id = c.component_id ?? 'unknown';
  if (includeScores && c.score != null) {
    return `### ${id} (${c.score}/10, ${c.confidence})\n${c.narrative ?? ''}`;
  }
  const inst = c.instrument ?? deriveInstrumentState(c);
  const instLine =
    `confidence=${inst.confidence}, sufficiency=${inst.evidence_sufficiency}` +
    `${inst.contested ? ', contested' : ''}` +
    `${inst.significant_delta ? ', significant_delta' : ''}`;
  return `### ${id} (${instLine})\n${c.narrative ?? ''}`;
}

/**
 * @param {object | null | undefined} reportData
 * @param {{ includeScores?: boolean }} [opts]
 */
export function buildReportContext(reportData, opts = {}) {
  if (!reportData) return { context: 'No resilience report is available for today yet.', pboLookup: {} };
  const a = reportData.assessment;
  const includeScores = opts.includeScores === true;

  const { index: pboIndex, lookup: pboLookup } = buildPboIndex(reportData.signals ?? a.signals);

  const reportDates = listReportDates();
  const { sourceTypes, signalDates } = listSignalMeta();

  let header;
  if (includeScores) {
    const scores = (a.components ?? [])
      .map((c) => `- ${c.component_id}: ${c.score}/10 (${c.confidence})`)
      .join('\n');
    header =
      `Today's resilience assessment (${a.date})\n` +
      `Overall score: ${a.overall_resilience_score}/10\n\n` +
      `Component scores:\n${scores}\n\n`;
  } else {
    header =
      `Today's resilience assessment (${a.date})\n` +
      `${operatorAssessmentSummary(a)}\n\n` +
      `Component instrument summary (no headline 1–10 scores in operator view):\n`;
  }

  const context =
    header +
    `Executive summary:\n${a.cross_component_synthesis ?? ''}\n\n` +
    `Components detail:\n` +
    (a.components ?? [])
      .map((c) => formatComponentBlock(c, { includeScores }))
      .join('\n\n') +
    pboIndex +
    `\n\nAVAILABLE DATA FOR TOOLS:\n` +
    `Report dates (for compare_dates): ${reportDates.join(', ')}\n` +
    `Signal source types (for lookup_signals): ${sourceTypes.join(', ')}\n` +
    `Signal dates: ${signalDates.join(', ')}`;
  return { context, pboLookup };
}
