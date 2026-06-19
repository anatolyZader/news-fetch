import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLogger } from '../../../cross-cut-modules/log/index.js';
import { translationTermRagEnabled } from '../../../cross-cut-modules/retrieval/ragConfig.js';
import { buildTranslationTermBlock } from '../../../cross-cut-modules/retrieval/translationTermRetrieval.js';
import { createRetrievalService } from '../../../cross-cut-modules/retrieval/createRetrievalService.js';

const log = createLogger('translation');
const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('../../../cross-cut-modules/retrieval/createRetrievalService.js').ReturnType<createRetrievalService> | null} */
let translationRetrievalSvc = null;

/**
 * @param {import('../../../cross-cut-modules/retrieval/createRetrievalService.js').ReturnType<createRetrievalService> | null} [svc]
 */
export function setTranslationRetrievalService(svc) {
  translationRetrievalSvc = svc;
}

export function resetTranslationRetrievalForTests() {
  translationRetrievalSvc = null;
}

function getTranslationRetrieval() {
  if (!translationTermRagEnabled()) return null;
  if (!translationRetrievalSvc) {
    const sqlitePath = process.env.SQLITE_PATH?.trim()
      ? resolve(process.env.SQLITE_PATH.trim())
      : resolve(__dirname, '../../../db/app.sqlite');
    translationRetrievalSvc = createRetrievalService({ dbPath: sqlitePath });
  }
  return translationRetrievalSvc;
}

/**
 * @param {string} lang
 * @param {string} baseSystem
 * @param {string} [queryHint]
 */
export async function translationSystemPrompt(lang, baseSystem, queryHint) {
  let system = baseSystem;
  const svc = getTranslationRetrieval();
  if (!svc) return system;
  const hint = String(queryHint ?? '').trim().slice(0, 600);
  if (!hint) return system;
  try {
    const block = await buildTranslationTermBlock(lang, hint, { retrieval: svc.retrieval });
    if (block) system += block;
  } catch (err) {
    log.warn('translation term RAG skipped:', err?.message ?? err);
  }
  return system;
}
