/**
 * SQLite chunk store + FTS5 for hybrid RAG retrieval.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { bufferToFloat32, cosineSim, float32ToBuffer } from '../vector_index/vectorMath.js';

const BASE_DDL = `
CREATE TABLE IF NOT EXISTS rag_chunks (
  chunk_id       TEXT PRIMARY KEY NOT NULL,
  namespace      TEXT NOT NULL,
  parent_id      TEXT NOT NULL,
  chunk_index    INTEGER NOT NULL,
  date           TEXT NOT NULL,
  source_type    TEXT,
  title          TEXT,
  source_url     TEXT,
  kind           TEXT NOT NULL DEFAULT 'original',
  scope_id       TEXT,
  chunk_text     TEXT NOT NULL,
  char_start     INTEGER,
  char_end       INTEGER,
  embedding      BLOB,
  dim            INTEGER,
  embed_model    TEXT,
  text_hash      TEXT NOT NULL,
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rag_chunks_ns_date
  ON rag_chunks(namespace, date);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_parent
  ON rag_chunks(parent_id);
CREATE INDEX IF NOT EXISTS idx_rag_chunks_date
  ON rag_chunks(date);
`;

const FTS_DDL = `
CREATE VIRTUAL TABLE IF NOT EXISTS rag_chunks_fts USING fts5(
  chunk_id UNINDEXED,
  chunk_text,
  title,
  tokenize='unicode61'
);
`;

/** Node built-in sqlite on some CI runners lacks the fts5 extension. */
function detectFts5Support() {
  const probe = new DatabaseSync(':memory:');
  try {
    probe.exec('CREATE VIRTUAL TABLE fts_probe USING fts5(content)');
    probe.exec('DROP TABLE fts_probe');
    return true;
  } catch {
    return false;
  } finally {
    probe.close();
  }
}

function safeJsonStringify(obj) {
  try {
    return obj == null ? null : JSON.stringify(obj);
  } catch {
    return null;
  }
}

/**
 * @param {string} dbPath
 * @param {{ metricsPort?: { histogram: (name: string, ms: number) => void }|null }} [opts]
 */
export function createChunkStore(dbPath, opts = {}) {
  const metricsPort = opts.metricsPort ?? null;

  function recordDuration(name, startMs) {
    if (!metricsPort) return;
    metricsPort.histogram(name, performance.now() - startMs);
  }
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(BASE_DDL);
  let ftsReady = false;
  if (detectFts5Support()) {
    try {
      db.exec(FTS_DDL);
      ftsReady = true;
    } catch {
      /* fts5 unavailable on this runtime despite probe */
    }
  }
  try { db.exec('PRAGMA journal_mode = WAL;'); } catch { /* ignore */ }

  function ftsSearchLike(p) {
    const q = String(p.query ?? '').trim();
    if (!q) return [];
    const ns = String(p.namespace ?? '').trim();
    const dateFrom = String(p.dateFrom ?? '').trim();
    const dateTo = String(p.dateTo ?? dateFrom).trim();
    const sourceType = p.sourceType ? String(p.sourceType).trim() : null;
    const topK = Math.max(1, Math.min(100, p.topK ?? 50));
    const terms = q
      .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 2)
      .slice(0, 12);
    if (terms.length === 0) return [];
    const likeClauses = terms.map(() => '(LOWER(c.chunk_text) LIKE ? OR LOWER(COALESCE(c.title, \'\')) LIKE ?)').join(' OR ');
    const binds = terms.flatMap((t) => {
      const pat = `%${t.toLowerCase()}%`;
      return [pat, pat];
    });
    const sql = sourceType
      ? `
        SELECT c.chunk_id, c.namespace, c.parent_id, c.chunk_index, c.date, c.source_type,
               c.title, c.source_url, c.kind, c.scope_id, c.chunk_text
        FROM rag_chunks c
        WHERE c.namespace = ?
          AND c.date >= ? AND c.date <= ?
          AND c.source_type = ?
          AND (${likeClauses})
        LIMIT ?
      `
      : `
        SELECT c.chunk_id, c.namespace, c.parent_id, c.chunk_index, c.date, c.source_type,
               c.title, c.source_url, c.kind, c.scope_id, c.chunk_text
        FROM rag_chunks c
        WHERE c.namespace = ?
          AND c.date >= ? AND c.date <= ?
          AND (${likeClauses})
        LIMIT ?
      `;
    const rows = sourceType
      ? db.prepare(sql).all(ns, dateFrom, dateTo, sourceType, ...binds, topK)
      : db.prepare(sql).all(ns, dateFrom, dateTo, ...binds, topK);
    return rows.map((r, idx) => ({
      chunkId: r.chunk_id,
      namespace: r.namespace,
      parentId: r.parent_id,
      chunkIndex: r.chunk_index,
      date: r.date,
      sourceType: r.source_type,
      title: r.title,
      sourceUrl: r.source_url,
      kind: r.kind,
      scopeId: r.scope_id,
      text: r.chunk_text,
      ftsRank: idx + 1,
      sim: 0,
      rankSource: 'fts',
      ftsPosition: idx + 1,
    }));
  }

  const deleteByParentStmt = db.prepare('DELETE FROM rag_chunks WHERE parent_id = ?');
  const insertChunkStmt = db.prepare(`
    INSERT INTO rag_chunks (
      chunk_id, namespace, parent_id, chunk_index, date, source_type, title, source_url,
      kind, scope_id, chunk_text, char_start, char_end, embedding, dim, embed_model, text_hash, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(chunk_id) DO UPDATE SET
      namespace = excluded.namespace,
      parent_id = excluded.parent_id,
      chunk_index = excluded.chunk_index,
      date = excluded.date,
      source_type = excluded.source_type,
      title = excluded.title,
      source_url = excluded.source_url,
      kind = excluded.kind,
      scope_id = excluded.scope_id,
      chunk_text = excluded.chunk_text,
      char_start = excluded.char_start,
      char_end = excluded.char_end,
      embedding = excluded.embedding,
      dim = excluded.dim,
      embed_model = excluded.embed_model,
      text_hash = excluded.text_hash,
      updated_at = datetime('now')
  `);

  const selectForDenseStmt = db.prepare(`
    SELECT chunk_id, namespace, parent_id, chunk_index, date, source_type, title, source_url,
           kind, scope_id, chunk_text, embedding, dim
    FROM rag_chunks
    WHERE namespace = ?
      AND date >= ? AND date <= ?
      AND (? IS NULL OR source_type = ?)
      AND embedding IS NOT NULL
  `);

  const selectByIdsStmt = db.prepare(`
    SELECT chunk_id, namespace, parent_id, chunk_index, date, source_type, title, source_url,
           kind, scope_id, chunk_text
    FROM rag_chunks
    WHERE chunk_id = ?
  `);

  const selectByParentStmt = db.prepare(`
    SELECT chunk_id, namespace, parent_id, chunk_index, date, source_type, title, source_url,
           kind, scope_id, chunk_text
    FROM rag_chunks
    WHERE namespace = ? AND parent_id = ?
    ORDER BY chunk_index ASC
  `);

  const deleteFtsByParentStmt = ftsReady
    ? db.prepare(`
    DELETE FROM rag_chunks_fts WHERE chunk_id IN (
      SELECT chunk_id FROM rag_chunks WHERE parent_id = ?
    )
  `)
    : null;

  const insertFtsStmt = ftsReady
    ? db.prepare(`
    INSERT INTO rag_chunks_fts(chunk_id, chunk_text, title)
    VALUES (?, ?, ?)
  `)
    : null;

  const deleteFtsChunkStmt = ftsReady
    ? db.prepare('DELETE FROM rag_chunks_fts WHERE chunk_id = ?')
    : null;

  function rebuildFts() {
    if (!ftsReady) return;
    db.exec('DELETE FROM rag_chunks_fts');
    db.exec(`
      INSERT INTO rag_chunks_fts(chunk_id, chunk_text, title)
      SELECT chunk_id, chunk_text, COALESCE(title, '') FROM rag_chunks
    `);
  }

  return {
    close() {
      db.close();
    },

    rebuildFts,

    deleteByParentId(parentId) {
      const pid = String(parentId ?? '').trim();
      if (deleteFtsByParentStmt) {
        try { deleteFtsByParentStmt.run(pid); } catch { /* ignore */ }
      }
      const result = deleteByParentStmt.run(pid);
      return result.changes ?? 0;
    },

    /**
     * @param {object} row
     * @param {{ vector?: Float32Array, model?: string }} [emb]
     */
    upsertChunk(row, emb = {}) {
      const chunkId = String(row.chunk_id ?? '').trim();
      if (!chunkId) return 0;
      let embBuf = null;
      let dim = null;
      let modelId = null;
      if (emb.vector?.length) {
        embBuf = float32ToBuffer(emb.vector);
        dim = emb.vector.length;
        modelId = emb.model ?? null;
      }
      if (deleteFtsChunkStmt) {
        try { deleteFtsChunkStmt.run(chunkId); } catch { /* ignore */ }
      }
      const result = insertChunkStmt.run(
        chunkId,
        String(row.namespace ?? 'archive'),
        String(row.parent_id ?? chunkId),
        Number(row.chunk_index ?? 0),
        String(row.date ?? ''),
        row.source_type ?? null,
        row.title ?? null,
        row.source_url ?? null,
        String(row.kind ?? 'original'),
        row.scope_id ?? null,
        String(row.chunk_text ?? ''),
        row.char_start ?? null,
        row.char_end ?? null,
        embBuf,
        dim,
        modelId,
        String(row.text_hash ?? ''),
      );
      if (insertFtsStmt) {
        try {
          insertFtsStmt.run(chunkId, String(row.chunk_text ?? ''), String(row.title ?? ''));
        } catch { /* ignore fts errors */ }
      }
      return result.changes ?? 0;
    },

    /**
     * @param {{
     *  namespace: string,
     *  dateFrom: string,
     *  dateTo: string,
     *  sourceType?: string|null,
     *  queryVector: Float32Array,
     *  topK: number,
     *  minSim?: number,
     * }} p
     */
    denseSearch(p) {
      const t0 = performance.now();
      try {
        const ns = String(p.namespace ?? '').trim();
        const dateFrom = String(p.dateFrom ?? '').trim();
        const dateTo = String(p.dateTo ?? dateFrom).trim();
        const sourceType = p.sourceType ? String(p.sourceType).trim() : null;
        const qv = p.queryVector;
        if (!qv?.length) return [];

        const rows = selectForDenseStmt.all(ns, dateFrom, dateTo, sourceType, sourceType);
        const scored = [];
        const minSim = p.minSim ?? 0;
        for (const r of rows) {
          if (!r.embedding) continue;
          const dv = bufferToFloat32(r.embedding);
          if (!dv.length) continue;
          const sim = cosineSim(qv, dv);
          if (sim >= minSim) {
            scored.push({
              chunkId: r.chunk_id,
              namespace: r.namespace,
              parentId: r.parent_id,
              chunkIndex: r.chunk_index,
              date: r.date,
              sourceType: r.source_type,
              title: r.title,
              sourceUrl: r.source_url,
              kind: r.kind,
              scopeId: r.scope_id,
              text: r.chunk_text,
              sim,
              rankSource: 'dense',
            });
          }
        }
        scored.sort((a, b) => b.sim - a.sim);
        return scored.slice(0, Math.max(1, Math.min(100, p.topK ?? 50)));
      } finally {
        recordDuration('sqlite.dense_search.duration_ms', t0);
      }
    },

    /**
     * FTS5 search with BM25 rank.
     * @param {{
     *  namespace: string,
     *  dateFrom: string,
     *  dateTo: string,
     *  query: string,
     *  sourceType?: string|null,
     *  topK: number,
     * }} p
     */
    ftsSearch(p) {
      const t0 = performance.now();
      try {
        if (!ftsReady) return ftsSearchLike(p);
        const q = String(p.query ?? '').trim();
        if (!q) return [];
        const ns = String(p.namespace ?? '').trim();
        const dateFrom = String(p.dateFrom ?? '').trim();
        const dateTo = String(p.dateTo ?? dateFrom).trim();
        const sourceType = p.sourceType ? String(p.sourceType).trim() : null;
        const topK = Math.max(1, Math.min(100, p.topK ?? 50));

        const terms = q
          .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
          .split(/\s+/)
          .filter((t) => t.length >= 2)
          .slice(0, 12);
        if (terms.length === 0) return [];

        const ftsQuery = terms.map((t) => `"${t.replaceAll('"', '')}"`).join(' OR ');
        let rows;
        try {
          const sql = sourceType
          ? `
          SELECT c.chunk_id, c.namespace, c.parent_id, c.chunk_index, c.date, c.source_type,
                 c.title, c.source_url, c.kind, c.scope_id, c.chunk_text,
                 bm25(rag_chunks_fts) AS fts_rank
          FROM rag_chunks_fts f
          JOIN rag_chunks c ON c.chunk_id = f.chunk_id
          WHERE rag_chunks_fts MATCH ?
            AND c.namespace = ?
            AND c.date >= ? AND c.date <= ?
            AND c.source_type = ?
          ORDER BY fts_rank
          LIMIT ?
        `
          : `
          SELECT c.chunk_id, c.namespace, c.parent_id, c.chunk_index, c.date, c.source_type,
                 c.title, c.source_url, c.kind, c.scope_id, c.chunk_text,
                 bm25(rag_chunks_fts) AS fts_rank
          FROM rag_chunks_fts f
          JOIN rag_chunks c ON c.chunk_id = f.chunk_id
          WHERE rag_chunks_fts MATCH ?
            AND c.namespace = ?
            AND c.date >= ? AND c.date <= ?
          ORDER BY fts_rank
          LIMIT ?
        `;
        if (sourceType) {
          rows = db.prepare(sql).all(ftsQuery, ns, dateFrom, dateTo, sourceType, topK);
        } else {
          rows = db.prepare(sql).all(ftsQuery, ns, dateFrom, dateTo, topK);
        }
      } catch {
        return [];
      }

      return rows.map((r, idx) => ({
        chunkId: r.chunk_id,
        namespace: r.namespace,
        parentId: r.parent_id,
        chunkIndex: r.chunk_index,
        date: r.date,
        sourceType: r.source_type,
        title: r.title,
        sourceUrl: r.source_url,
        kind: r.kind,
        scopeId: r.scope_id,
        text: r.chunk_text,
        ftsRank: r.fts_rank,
        sim: 0,
        rankSource: 'fts',
        ftsPosition: idx + 1,
      }));
      } finally {
        recordDuration('sqlite.fts_search.duration_ms', t0);
      }
    },

    listChunksByParent(namespace, parentId) {
      const rows = selectByParentStmt.all(String(namespace ?? 'archive'), String(parentId ?? '').trim());
      return rows.map((r) => ({
        chunkId: r.chunk_id,
        namespace: r.namespace,
        parentId: r.parent_id,
        chunkIndex: r.chunk_index,
        date: r.date,
        sourceType: r.source_type,
        title: r.title,
        sourceUrl: r.source_url,
        kind: r.kind,
        scopeId: r.scope_id,
        text: r.chunk_text,
      }));
    },

    getChunksByIds(chunkIds) {
      const out = [];
      for (const id of chunkIds) {
        const row = selectByIdsStmt.get(String(id));
        if (row) {
          out.push({
            chunkId: row.chunk_id,
            namespace: row.namespace,
            parentId: row.parent_id,
            chunkIndex: row.chunk_index,
            date: row.date,
            sourceType: row.source_type,
            title: row.title,
            sourceUrl: row.source_url,
            kind: row.kind,
            scopeId: row.scope_id,
            text: row.chunk_text,
          });
        }
      }
      return out;
    },

    /**
     * Delete chunks for ephemeral archive rows purged before cutoff (news/radio/social only).
     * @param {string} cutoffDate YYYY-MM-DD
     * @param {readonly string[]} ephemeralTypes
     */
    deleteEphemeralBeforeDate(cutoffDate, ephemeralTypes) {
      const cutoff = String(cutoffDate ?? '').trim();
      if (!cutoff || !ephemeralTypes?.length) return 0;
      const placeholders = ephemeralTypes.map(() => '?').join(',');
      const result = db.prepare(`
        DELETE FROM rag_chunks
        WHERE date < ? AND namespace = 'archive' AND source_type IN (${placeholders})
      `).run(cutoff, ...ephemeralTypes);
      try { rebuildFts(); } catch { /* ignore */ }
      return result.changes ?? 0;
    },

    /**
     * Delete all report-namespace chunks for a report key prefix.
     * @param {string} reportParentPrefix e.g. report:2026-05-30:national:
     */
    deleteReportNamespace(reportParentPrefix) {
      const prefix = String(reportParentPrefix ?? '').trim();
      if (!prefix) return 0;
      const result = db.prepare(`
        DELETE FROM rag_chunks WHERE namespace = 'report' AND parent_id LIKE ?
      `).run(`${prefix}%`);
      return result.changes ?? 0;
    },

    listParentsByDate(namespace, date) {
      return db.prepare(`
        SELECT DISTINCT parent_id, source_type, title, date
        FROM rag_chunks
        WHERE namespace = ? AND date = ?
      `).all(String(namespace), String(date));
    },
  };
}

export { safeJsonStringify };
