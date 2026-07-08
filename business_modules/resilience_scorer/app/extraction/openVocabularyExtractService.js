/**
 * STAGE 1 — open-vocabulary extraction.
 * No fixed signal catalogue: asks the LLM for free-form observations, writing
 * observations-pipeline-{source}-{date}.json for downstream specialist agents
 * and omission-audit use. This path does NOT produce signals for deterministic scoring.
 */

/**
 * Run the open-vocabulary pipeline extract (no closed catalogue, no signals JSON write).
 * Delegates to the open_observation_extraction module's pipeline profile.
 *
 * @param {{
 *   articles: Array<object>,
 *   sourceType: string,
 *   contentKind?: string,
 *   date: string,
 *   filePaths?: string[],
 *   onUsage?: Function,
 * }} opts
 */
export async function runOpenVocabularyExtract(opts) {
  const {
    articles,
    sourceType,
    contentKind = 'mixed',
    date,
    filePaths = [],
    onUsage,
  } = opts;

  const { runPipelineOpenExtract } = await import('../../../open_observation_extraction/index.js');
  return runPipelineOpenExtract({
    articles,
    sourceType,
    contentKind,
    date,
    sourceFiles: filePaths,
    onUsage,
  });
}
