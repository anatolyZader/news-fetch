/**
 * Canonical paths for resilience tuning fixtures (golden corpus, adversarial cases).
 */

import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TUNING_DIR = resolve(dirname(fileURLToPath(import.meta.url)));
export const GOLDEN_DIR = resolve(TUNING_DIR, 'golden');
export const CORPUS_PATH = resolve(GOLDEN_DIR, 'corpus.jsonl');
export const EXTRACTION_SNAPSHOT_PATH = resolve(GOLDEN_DIR, 'extraction-snapshot.jsonl');
export const TYPE_COVERAGE_SNAPSHOT_PATH = resolve(GOLDEN_DIR, 'type-coverage-snapshot.jsonl');
export const BUILD_CORPUS_SCRIPT = resolve(GOLDEN_DIR, 'buildCorpus.mjs');
export const ADVERSARIAL_CASES_PATH = resolve(TUNING_DIR, 'adversarial', 'cases.json');
