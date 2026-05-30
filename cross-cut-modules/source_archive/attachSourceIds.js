/**
 * Map merged MD article_index (1-based) to stable source_id values.
 */
import { resolve } from 'node:path';
import { buildMdSourceIdFromPath } from './sourceId.js';
import { loadMdFile } from '../../business_modules/resilience/infrastructure/mdReportsLoader.js';

/**
 * @param {string[]} filePaths absolute or relative paths
 * @param {string} repoRoot
 * @returns {Map<number, string>} article_index → source_id
 */
export function buildArticleIndexSourceIdMap(filePaths, repoRoot) {
  const map = new Map();
  let globalIndex = 0;
  for (const fp of filePaths) {
    const abs = resolve(fp);
    const { articles } = loadMdFile(abs);
    for (let i = 0; i < articles.length; i++) {
      if (!String(articles[i].body ?? '').trim()) continue;
      globalIndex += 1;
      map.set(globalIndex, buildMdSourceIdFromPath(repoRoot, abs, i + 1));
    }
  }
  return map;
}

/**
 * @param {Array<object>} signals
 * @param {string[]} filePaths
 * @param {string} repoRoot
 * @returns {Array<object>}
 */
export function attachSourceIdsToSignals(signals, filePaths, repoRoot) {
  const map = buildArticleIndexSourceIdMap(filePaths, repoRoot);
  return (signals ?? []).map((s) => {
    const idx = Number(s?.article_index);
    if (!Number.isFinite(idx) || idx <= 0) return s;
    const source_id = map.get(idx);
    return source_id ? { ...s, source_id } : s;
  });
}

/**
 * Attach stable source_id to each article in the flat list produced by loadMdFiles.
 * @param {Array<object>} articles
 * @param {string[]} filePaths
 * @param {string} repoRoot
 * @returns {Array<object>}
 */
export function attachSourceIdsToArticles(articles, filePaths, repoRoot) {
  const map = buildArticleIndexSourceIdMap(filePaths, repoRoot);
  let idx = 0;
  return (articles ?? []).map((a) => {
    if (!String(a.body ?? '').trim()) return a;
    idx += 1;
    const source_id = map.get(idx);
    return source_id ? { ...a, source_id } : a;
  });
}
