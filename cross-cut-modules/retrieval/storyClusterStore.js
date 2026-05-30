/**
 * Persistent story-cluster index for cross-source semantic dedup.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { bufferToFloat32, float32ToBuffer } from '../vector_index/vectorMath.js';

const DDL = `
CREATE TABLE IF NOT EXISTS rag_story_clusters (
  cluster_id TEXT PRIMARY KEY NOT NULL,
  source_type TEXT NOT NULL,
  signal_type TEXT NOT NULL,
  evidence_hash TEXT NOT NULL,
  evidence_preview TEXT,
  centroid_embedding BLOB,
  dim INTEGER,
  embed_model TEXT,
  member_count INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_rag_story_clusters_group
  ON rag_story_clusters(source_type, signal_type);
`;

/**
 * @param {string} dbPath
 */
export function createStoryClusterStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);
  try { db.exec('PRAGMA journal_mode = WAL;'); } catch { /* ignore */ }

  const selectByGroupStmt = db.prepare(`
    SELECT cluster_id, source_type, signal_type, evidence_hash, evidence_preview,
           centroid_embedding, dim, embed_model, member_count
    FROM rag_story_clusters
    WHERE source_type = ? AND signal_type = ?
  `);

  const upsertStmt = db.prepare(`
    INSERT INTO rag_story_clusters (
      cluster_id, source_type, signal_type, evidence_hash, evidence_preview,
      centroid_embedding, dim, embed_model, member_count, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(cluster_id) DO UPDATE SET
      member_count = excluded.member_count,
      evidence_preview = COALESCE(excluded.evidence_preview, rag_story_clusters.evidence_preview),
      updated_at = datetime('now')
  `);

  const incrementMemberStmt = db.prepare(`
    UPDATE rag_story_clusters
    SET member_count = member_count + 1, updated_at = datetime('now')
    WHERE cluster_id = ?
  `);

  return {
    close() {
      db.close();
    },

    listClustersForGroup(sourceType, signalType) {
      const st = String(sourceType ?? '_unknown');
      const sig = String(signalType ?? '_');
      return selectByGroupStmt.all(st, sig).map((r) => ({
        clusterId: r.cluster_id,
        sourceType: r.source_type,
        signalType: r.signal_type,
        evidenceHash: r.evidence_hash,
        evidencePreview: r.evidence_preview,
        vector: r.centroid_embedding ? bufferToFloat32(r.centroid_embedding) : null,
        dim: r.dim,
        embedModel: r.embed_model,
        memberCount: r.member_count,
      }));
    },

    upsertCluster(row) {
      upsertStmt.run(
        row.clusterId,
        row.sourceType,
        row.signalType,
        row.evidenceHash,
        row.evidencePreview ?? null,
        row.vector ? float32ToBuffer(row.vector) : null,
        row.dim ?? null,
        row.embedModel ?? null,
        row.memberCount ?? 1,
      );
    },

    incrementMember(clusterId) {
      incrementMemberStmt.run(clusterId);
    },
  };
}
