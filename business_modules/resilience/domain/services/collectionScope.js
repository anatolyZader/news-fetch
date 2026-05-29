import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../config/collectionScope.json',
);

/** @type {Record<string, { defaultDistrictId?: string, structured?: boolean }> | null} */
let cachedSources = null;

function loadSources(configPath = DEFAULT_PATH) {
  if (cachedSources && configPath === DEFAULT_PATH) return cachedSources;
  if (!existsSync(configPath)) {
    cachedSources = {};
    return cachedSources;
  }
  try {
    const parsed = JSON.parse(readFileSync(configPath, 'utf8'));
    const sources = parsed?.sources && typeof parsed.sources === 'object' ? parsed.sources : {};
    if (configPath === DEFAULT_PATH) cachedSources = sources;
    return sources;
  } catch {
    cachedSources = {};
    return cachedSources;
  }
}

/** Reset cached config (tests). */
export function resetCollectionScopeCache() {
  cachedSources = null;
}

/**
 * @param {string} [sourceType]
 * @returns {string | null}
 */
export function collectionDistrictForSourceType(sourceType) {
  const st = String(sourceType ?? '').trim().toLowerCase();
  if (!st) return null;
  const entry = loadSources()[st];
  const id = entry?.defaultDistrictId;
  return typeof id === 'string' && id.trim() ? id.trim().toLowerCase() : null;
}

/**
 * @param {string} [sourceType]
 * @returns {boolean}
 */
export function isStructuredCollectionSource(sourceType) {
  const st = String(sourceType ?? '').trim().toLowerCase();
  if (!st) return false;
  return loadSources()[st]?.structured === true;
}

/**
 * @returns {Record<string, { defaultDistrictId?: string, structured?: boolean }>}
 */
export function getCollectionScopeBySourceType() {
  return { ...loadSources() };
}
