/**
 * STAGE 1 — open-vocabulary extraction ("open X" / novel observations).
 *
 * Pipeline position: optional parallel sibling to closed-catalogue extract
 * (see extractionStageRunner). Asks the LLM for free-form observations with
 * no fixed SIGNAL_CATALOG, writing observations-pipeline-{source}-{date}.json
 * for specialist agents and omission-audit — not for deterministic component
 * evidence counts.
 *
 * Owns: thin wrapper that delegates to open_observation_extraction's pipeline
 * profile (dynamic import to avoid hard coupling at module load).
 *
 * Does NOT: write closed signals-*.json or feed buildComponentEvidence directly.
 * Naming note (AGENTS.md): open vocabulary at extract; open observations at
 * artifact/load; open evidence at verification — related family, different stages.
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
