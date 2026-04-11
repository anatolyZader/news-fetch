/**
 * Build the system prompt context from a resilience report.
 */
import { buildPboIndex } from './pboIndex.js';
import { listReportDates, listSignalMeta } from './signalLookup.js';

export function buildReportContext(reportData) {
  if (!reportData) return { context: 'No resilience report is available for today yet.', pboLookup: {} };
  const a = reportData.assessment;
  const scores = (a.components ?? [])
    .map((c) => `- ${c.component_id}: ${c.score}/10 (${c.confidence})`)
    .join('\n');
  const { index: pboIndex, lookup: pboLookup } = buildPboIndex(reportData.signals ?? a.signals);

  // Available data for tools
  const reportDates = listReportDates();
  const { sourceTypes, signalDates } = listSignalMeta();

  const context =
    `Today's resilience assessment (${a.date})\n` +
    `Overall score: ${a.overall_resilience_score}/10\n\n` +
    `Component scores:\n${scores}\n\n` +
    `Executive summary:\n${a.cross_component_synthesis ?? ''}\n\n` +
    `Components detail:\n` +
    (a.components ?? [])
      .map((c) => `### ${c.component_id} (${c.score}/10)\n${c.narrative ?? ''}`)
      .join('\n\n') +
    pboIndex +
    `\n\nAVAILABLE DATA FOR TOOLS:\n` +
    `Report dates (for compare_dates): ${reportDates.join(', ')}\n` +
    `Signal source types (for lookup_signals): ${sourceTypes.join(', ')}\n` +
    `Signal dates: ${signalDates.join(', ')}`;
  return { context, pboLookup };
}
