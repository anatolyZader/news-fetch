/**
 * @typedef {import('../value_objects/pipelineStages.js').PipelineStage} PipelineStage
 *
 * @typedef {object} PipelineRunRecord
 * @property {string} runKey
 * @property {string} reportDate
 * @property {string} reportScopeId
 * @property {Record<string, { status: string, at: string, versions?: object }>} stages
 */

/**
 * @typedef {object} IPipelineRunStore
 * @property {(opts: { runKey: string, reportDate: string, reportScopeId: string }) => void} startRun
 * @property {(runKey: string, stage: PipelineStage, versions?: object) => void} completeStage
 * @property {(runKey: string, stage: PipelineStage, error: string) => void} failStage
 * @property {(runKey: string) => PipelineRunRecord | null} getRun
 */

export {};
