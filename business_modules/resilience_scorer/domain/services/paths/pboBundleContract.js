/**
 * Extractor-contract marker for PBO municipal signal bundles.
 *
 * Pipeline position: ingest planning + assess load — decides whether a stored
 * bundle may be reused.
 *
 * Why this exists: until 2026-06-20 PBO signals were produced by a
 * deterministic component → signal_type table with `isPositive = avg >= 0.5`,
 * which emitted exactly one signal per resilience component per municipality
 * and let the officer's numeric score, not their text, choose polarity. That
 * extractor was deleted and replaced by an LLM pass, but reuse-first replay
 * keeps serving its output, so every report still reads the old shape. Bundles
 * written before the cutover carry no marker; treating a missing marker as
 * stale is what forces them to be re-extracted.
 *
 * Owns: the marker constants, the satisfied/stale predicates, and the coded
 * abort. Does NOT: decide *when* to re-extract (pipelineIngestPlan.js) or how
 * signals are cleaned (hygiene/fieldReportHygiene.js).
 *
 * Key collaborators: pbo_report/input/extract-pbo-signals.js (writer),
 * app/pipeline/pipelineIngestPlan.js, signalBundles.js.
 */

/** Identifier stamped on bundles produced by the LLM field-report extractor. */
export const PBO_EXTRACTOR_CONTRACT = 'pbo_llm_field_report';

/** Contract version written by the current extractor. */
export const PBO_EXTRACTOR_CONTRACT_VERSION = 1;

/** Lowest contract version the assess path will read. Bump to force a re-extraction. */
export const MIN_PBO_EXTRACTOR_CONTRACT_VERSION = 1;

/** Env key that disables the gate (`=0`) so historical bundles can be loaded knowingly. */
export const PBO_CONTRACT_GATE_BLOCK_ENV_KEY = 'RESILIENCE_PBO_CONTRACT_GATE_BLOCK';

/**
 * Whether a source type is a PBO *municipal* bundle.
 *
 * Exact match on purpose: `pbo_regional` is a separate extractor
 * (extract-regional-pbo-signals.js) that never wrote the marker and is not
 * implicated in the deterministic-table defect, so the prefix-matching idiom
 * used elsewhere in signalBundles.js must not be copied here.
 *
 * @param {string|null|undefined} sourceType
 * @returns {boolean}
 */
export function isPboMunicipalBundle(sourceType) {
  return sourceType === 'pbo';
}

/**
 * Whether a loaded bundle body carries an acceptable extractor contract.
 *
 * @param {{extractor_contract?: string, extractor_contract_version?: number}|null|undefined} data
 * @returns {boolean}
 */
export function pboBundleContractSatisfied(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.extractor_contract !== PBO_EXTRACTOR_CONTRACT) return false;
  const version = Number(data.extractor_contract_version);
  return Number.isFinite(version) && version >= MIN_PBO_EXTRACTOR_CONTRACT_VERSION;
}

/**
 * Whether the contract gate blocks (default) or merely warns.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
export function isPboContractGateBlocking(env = process.env) {
  const v = env[PBO_CONTRACT_GATE_BLOCK_ENV_KEY];
  if (v == null || v === '') return true;
  return !(v === '0' || v === 'false' || v === 'off');
}

/**
 * Names of loaded PBO municipal bundles that fail the contract.
 *
 * @param {Array<{sourceType?: string, data?: object, file?: string, fileDate?: string}>} loadedFiles
 * @returns {string[]}
 */
export function stalePboBundleFiles(loadedFiles) {
  const out = [];
  for (const entry of loadedFiles ?? []) {
    if (!isPboMunicipalBundle(entry?.sourceType)) continue;
    if (pboBundleContractSatisfied(entry?.data)) continue;
    out.push(entry?.file ?? `signals-pbo-${entry?.fileDate ?? 'unknown'}.json`);
  }
  return out;
}

/**
 * Abort when any loaded PBO municipal bundle predates the current extractor.
 *
 * Warns instead of throwing when the gate is disabled, so the user gets the
 * same signal either way.
 *
 * @param {Array<object>} loadedFiles
 * @param {{env?: NodeJS.ProcessEnv}} [opts]
 * @throws {Error & {code: 'stale_pbo_bundle_contract', files: string[]}}
 */
export function assertPboBundleContract(loadedFiles, { env = process.env } = {}) {
  const files = stalePboBundleFiles(loadedFiles);
  if (files.length === 0) return;
  if (!isPboContractGateBlocking(env)) {
    console.log(`  ⚠ Loading ${files.length} PBO bundle(s) that predate the current extractor contract: ${files.join(', ')}`);
    return;
  }
  const err = new Error(`Stale PBO signal bundle(s) predate the current extractor contract: ${files.join(', ')}`);
  err.code = 'stale_pbo_bundle_contract';
  err.files = files;
  throw err;
}
