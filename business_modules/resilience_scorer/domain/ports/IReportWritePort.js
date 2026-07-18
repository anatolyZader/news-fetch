/**
 * Report write port — persists a finished assessment as report artifacts
 * (.md / -brief.md / .json).
 *
 * Implemented by infrastructure/adapters/resilienceReportFsAdapter.js.
 *
 * @typedef {object} IReportWritePort
 * @property {(assessment: object, sourceFiles: string[], signals: Array<object>, opts?: object) => object} writeReport
 */
export {};
