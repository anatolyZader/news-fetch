/**
 * Application orchestration: parsed PBO event log → classify → synthesize → write.
 */
import { parseEventLog } from '../domain/services/eventLogLoader.js';
import { classifyEvents, synthesizeFromEvents } from './eventLogEvaluator.js';
import { writeEventReport } from '../infrastructure/adapters/eventLogReportWriter.js';

/**
 * @param {object} parsedLog       Output of parseEventLog()
 * @param {string} reportDate      YYYY-MM-DD
 * @param {string} outputBase      Path without extension
 * @param {string} sourceName      Basename or 'stdin' (for report header)
 * @param {{ onUsage?: (e: { label: string, model: string, usage: object }) => void }} [runOptions]
 */
export async function runPboEventLogAnalysisFromParsed(parsedLog, reportDate, outputBase, sourceName, runOptions = {}) {
  const { onUsage } = runOptions;
  const classifications = await classifyEvents(parsedLog, { onUsage });
  const assessment = await synthesizeFromEvents(parsedLog, classifications, reportDate, { onUsage });
  const paths = writeEventReport(assessment, classifications, parsedLog, sourceName, outputBase);
  return { assessment, classifications, parsedLog, paths };
}

/**
 * @param {object} opts
 * @param {string} opts.rawText       Full log file contents
 * @param {string} opts.sourceName    Basename or 'stdin'
 * @param {string} opts.reportDate    YYYY-MM-DD
 * @param {string} opts.outputBase    Path without extension
 * @param {(e: { label: string, model: string, usage: object }) => void} [opts.onUsage]
 */
export async function runPboEventLogAnalysis({ rawText, sourceName, reportDate, outputBase, onUsage }) {
  const parsedLog = parseEventLog(rawText, sourceName);
  if (parsedLog.events.length === 0) {
    throw new Error(
      'No events found in input. Check the format:\n  time | actor | behavior | category | context | source',
    );
  }
  return runPboEventLogAnalysisFromParsed(parsedLog, reportDate, outputBase, sourceName, { onUsage });
}
