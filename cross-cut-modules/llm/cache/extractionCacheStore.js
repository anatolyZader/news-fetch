/**
 * SQLite-backed LLM extraction response cache.
 */
import { openAppDatabase } from '../../../db/persistence/openDatabase.js';
import { resolveSqlitePath } from '../../config/sqlitePath.js';
import { createHash } from 'node:crypto';

const DDL = `
CREATE TABLE IF NOT EXISTS llm_extraction_cache (
  cache_key       TEXT PRIMARY KEY NOT NULL,
  source_id       TEXT,
  content_hash    TEXT NOT NULL,
  catalog_version TEXT NOT NULL,
  prompt_version  TEXT NOT NULL,
  stage           TEXT NOT NULL DEFAULT 'extract',
  domain_group    TEXT,
  content_kind    TEXT NOT NULL,
  model           TEXT NOT NULL,
  signals_json    TEXT NOT NULL,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  hit_count       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_extraction_cache_content
  ON llm_extraction_cache(content_hash, catalog_version, prompt_version);
`;

/**
 * @param {string} text
 */
export function hashArticleContent(text) {
  return createHash('sha256').update(String(text ?? ''), 'utf8').digest('hex');
}

/**
 * @param {object} article
 */
export function articleContentHash(article) {
  const title = String(article?.title ?? '').trim();
  const body = String(article?.body ?? article?.promptBody ?? '').trim();
  return hashArticleContent(`${title}\n${body}`);
}

/**
 * @param {{
 *   contentHash: string,
 *   catalogVersion: string,
 *   promptVersion: string,
 *   contentKind: string,
 *   domainGroup?: string|null,
 *   model: string,
 *   multipassMode?: string,
 * }} parts
 */
export function buildExtractCacheKey(parts) {
  const dg = parts.domainGroup ?? '_single';
  const mp = parts.multipassMode ?? '0';
  return [
    parts.contentHash,
    parts.catalogVersion,
    parts.promptVersion,
    parts.contentKind,
    dg,
    parts.model,
    mp,
  ].join(':');
}

/**
 * @param {string} [dbPath]
 */
export function createExtractionCacheStore(dbPath) {
  const path = dbPath ?? resolveSqlitePath();
  const db = openAppDatabase(path);
  db.exec(DDL);

  const getStmt = db.prepare('SELECT signals_json, hit_count FROM llm_extraction_cache WHERE cache_key = ?');
  const putStmt = db.prepare(`
    INSERT INTO llm_extraction_cache (
      cache_key, source_id, content_hash, catalog_version, prompt_version,
      stage, domain_group, content_kind, model, signals_json, created_at, hit_count
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), 0)
    ON CONFLICT(cache_key) DO UPDATE SET
      signals_json = excluded.signals_json,
      created_at = datetime('now')
  `);
  const bumpStmt = db.prepare('UPDATE llm_extraction_cache SET hit_count = hit_count + 1 WHERE cache_key = ?');
  const invalidateStmt = db.prepare('DELETE FROM llm_extraction_cache WHERE prompt_version != ? OR catalog_version != ?');

  return {
    dbPath: path,

    /**
     * @param {string} cacheKey
     * @returns {object[]|null}
     */
    getCachedSignals(cacheKey) {
      const row = getStmt.get(cacheKey);
      if (!row) return null;
      bumpStmt.run(cacheKey);
      try {
        const parsed = JSON.parse(row.signals_json);
        return Array.isArray(parsed) ? parsed : null;
      } catch {
        return null;
      }
    },

    /**
     * @param {string} cacheKey
     * @param {object} meta
     * @param {object[]} signals
     */
    putCachedSignals(cacheKey, meta, signals) {
      putStmt.run(
        cacheKey,
        meta.sourceId ?? null,
        meta.contentHash,
        meta.catalogVersion,
        meta.promptVersion,
        meta.stage ?? 'extract',
        meta.domainGroup ?? null,
        meta.contentKind,
        meta.model,
        JSON.stringify(signals),
      );
    },

    /**
     * @param {string} promptVersion
     * @param {string} catalogVersion
     */
    invalidateByVersions(promptVersion, catalogVersion) {
      invalidateStmt.run(promptVersion, catalogVersion);
    },

    close() {
      db.close();
    },
  };
}

let sharedStore = null;

/**
 * @param {string} [dbPath]
 */
export function getExtractionCacheStore(dbPath) {
  if (!sharedStore) sharedStore = createExtractionCacheStore(dbPath);
  return sharedStore;
}

export function resetExtractionCacheStoreForTests() {
  if (sharedStore) {
    sharedStore.close();
    sharedStore = null;
  }
}
