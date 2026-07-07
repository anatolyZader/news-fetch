/**
 * Filesystem report writer — delegates to existing reportWriter.
 */
import { writeReport as writeResilienceReportFiles } from '../reportWriter.js';

export function createResilienceReportFsAdapter() {
  return {
    writeReport: ({ assessment, signals, sourceFiles, outputBase, scoreBySource, assessmentWindow }) =>
      writeResilienceReportFiles(assessment, signals, sourceFiles, outputBase, { scoreBySource, assessmentWindow }),
  };
}
