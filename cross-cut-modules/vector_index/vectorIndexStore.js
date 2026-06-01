/**
 * Persistent local vector index (SQLite) for retrieval and semantic deduplication.
 *
 * Notes:
 * - Uses node built-in `node:sqlite` (same as other stores in this repo).
 * - Stores embeddings as BLOB(Float32Array) and computes cosine similarity in JS.
 * - Maintains a small embedding cache keyed by (model, sha256(text)).
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

import { getDefaultEmbeddingPort } from './infrastructure/openaiEmbeddingPortAdapter.js';
import { bufferToFloat32, cosineSim, float32ToBuffer } from './vectorMath.js';

const embeddingPort = getDefaultEmbeddingPort();

const DDL = `
CREATE TABLE IF NOT EXISTS vector_documents (
  id           INTEGER PRIMARY KEY,
  namespace    TEXT NOT NULL,
  doc_id       TEXT NOT NULL,
  kind         TEXT NOT NULL,
  text         TEXT NOT NULL,
  text_hash    TEXT NOT NULL,
  embedding    BLOB,
  dim          INTEGER,
  model        TEXT,
  meta_json    TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vector_documents_ns_doc
  ON vector_documents(namespace, doc_id);
CREATE INDEX IF NOT EXISTS idx_vector_documents_ns_kind
  ON vector_documents(namespace, kind, updated_at);

CREATE TABLE IF NOT EXISTS vector_embedding_cache (
  model      TEXT NOT NULL,
  text_hash  TEXT NOT NULL,
  embedding  BLOB NOT NULL,
  dim        INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY(model, text_hash)
);
`;

function sha256Hex(s) {
  return createHash('sha256').update(String(s ?? '')).digest('hex');
}

function safeJsonStringify(obj) {
  try {
    return obj == null ? null : JSON.stringify(obj);
  } catch {
    return null;
  }
}

function safeJsonParse(s) {
  if (typeof s !== 'string' || !s.trim()) return null;
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/**
 * @param {string} dbPath absolute path to the shared app sqlite file
 */
export function createVectorIndexStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);
  try { db.exec('PRAGMA journal_mode = WAL;'); } catch { /* ignore */ }

  const upsertDocStmt = db.prepare(`
    INSERT INTO vector_documents (namespace, doc_id, kind, text, text_hash, embedding, dim, model, meta_json, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(namespace, doc_id) DO UPDATE SET
      kind = excluded.kind,
      text = excluded.text,
      text_hash = excluded.text_hash,
      embedding = excluded.embedding,
      dim = excluded.dim,
      model = excluded.model,
      meta_json = excluded.meta_json,
      updated_at = datetime('now')
  `);

  const selectDocsForScanStmt = db.prepare(`
    SELECT doc_id, kind, text, embedding, dim, model, meta_json
    FROM vector_documents
    WHERE namespace = ?
      AND (? IS NULL OR kind = ?)
  `);

  const selectCacheStmt = db.prepare(`
    SELECT embedding, dim
    FROM vector_embedding_cache
    WHERE model = ? AND text_hash = ?
    LIMIT 1
  `);

  const insertCacheStmt = db.prepare(`
    INSERT OR REPLACE INTO vector_embedding_cache (model, text_hash, embedding, dim)
    VALUES (?, ?, ?, ?)
  `);

  async function embedWithCache(text, model) {
    const clean = String(text ?? '').trim();
    const hash = sha256Hex(clean);
    const row = selectCacheStmt.get(model, hash);
    if (row?.embedding) {
      return { vector: bufferToFloat32(row.embedding), dim: row.dim, model, textHash: hash, cached: true };
    }
    const emb = await embeddingPort.embed(clean, { model });
    insertCacheStmt.run(model, hash, float32ToBuffer(emb.vector), emb.dim);
    return { vector: emb.vector, dim: emb.dim, model, textHash: hash, cached: false };
  }

  return {
    /**
     * Upsert a set of documents into the index.
     * @param {{
     *  namespace: string,
     *  documents: Array<{ docId: string, kind: string, text: string, meta?: any }>,
     *  model?: string,
     * }} p
     */
    async upsertDocuments({ namespace, documents, model = null }) {
      const ns = String(namespace ?? '').trim();
      if (!ns) throw new Error('vectorIndexStore.upsertDocuments: namespace required');
      if (!Array.isArray(documents) || documents.length === 0) return { upserted: 0, embedded: 0, skipped: 0 };

      const usedModel = model ?? embeddingPort.getModelId();
      const doEmbed = embeddingPort.enabled();

      let upserted = 0;
      let embedded = 0;
      let skipped = 0;

      for (const d of documents) {
        const docId = String(d?.docId ?? '').trim();
        const kind = String(d?.kind ?? '').trim() || 'unknown';
        const text = String(d?.text ?? '').trim();
        if (!docId || !text) { skipped++; continue; }

        const textHash = sha256Hex(text);
        let embBuf = null;
        let dim = null;
        let modelId = null;
        if (doEmbed) {
          const emb = await embedWithCache(text, usedModel);
          embBuf = float32ToBuffer(emb.vector);
          dim = emb.dim;
          modelId = usedModel;
          embedded++;
        }

        const metaJson = safeJsonStringify(d?.meta ?? null);
        const result = upsertDocStmt.run(
          ns,
          docId,
          kind,
          text,
          textHash,
          embBuf,
          dim,
          modelId,
          metaJson,
        );
        upserted += result.changes ?? 0;
      }

      return { upserted, embedded, skipped, model: usedModel, embeddingsEnabled: doEmbed };
    },

    /**
     * Query for similar documents.
     * @param {{
     *  namespace: string,
     *  queryText: string,
     *  kind?: string|null,
     *  topK?: number,
     *  minSim?: number,
     *  model?: string,
     * }} p
     */
    async querySimilar({ namespace, queryText, kind = null, topK = 8, minSim = 0.2, model = null }) {
      const ns = String(namespace ?? '').trim();
      if (!ns) throw new Error('vectorIndexStore.querySimilar: namespace required');
      const text = String(queryText ?? '').trim();
      if (!text) return [];
      if (!embeddingPort.enabled()) return [];

      const usedModel = model ?? embeddingPort.getModelId();
      const q = await embedWithCache(text, usedModel);
      const qv = q.vector;

      const rows = selectDocsForScanStmt.all(ns, kind, kind);
      const scored = [];
      for (const r of rows) {
        if (!r?.embedding) continue;
        const dv = bufferToFloat32(r.embedding);
        if (!dv.length) continue;
        const sim = cosineSim(qv, dv);
        if (sim >= minSim) {
          scored.push({
            docId: r.doc_id,
            kind: r.kind,
            sim,
            text: r.text,
            meta: r.meta_json ? safeJsonParse(r.meta_json) : null,
          });
        }
      }
      scored.sort((a, b) => b.sim - a.sim);
      return scored.slice(0, Math.max(1, Math.min(50, topK)));
    },
  };
}

