/**
 * SQLite store for catalog draft proposals.
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const DDL = `
CREATE TABLE IF NOT EXISTS catalog_proposals (
  id            TEXT PRIMARY KEY NOT NULL,
  cluster_key   TEXT NOT NULL,
  proposal_json TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft',
  reviewer      TEXT,
  review_note   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at   TEXT
);

CREATE INDEX IF NOT EXISTS idx_catalog_proposals_status
  ON catalog_proposals(status, created_at DESC);
`;

function rowToProposal(row) {
  let proposal_json = {};
  try {
    proposal_json = JSON.parse(row.proposal_json);
  } catch {
    proposal_json = {};
  }
  return {
    id: row.id,
    cluster_key: row.cluster_key,
    proposal_json,
    status: row.status,
    reviewer: row.reviewer,
    review_note: row.review_note,
    created_at: row.created_at,
    reviewed_at: row.reviewed_at,
  };
}

export function createCatalogProposalSqliteStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);

  return {
    upsertDraft({ clusterKey, proposalJson }) {
      const existing = db.prepare(`
        SELECT id FROM catalog_proposals WHERE cluster_key = ? AND status = 'draft' LIMIT 1
      `).get(clusterKey);
      if (existing?.id) {
        db.prepare(`
          UPDATE catalog_proposals SET proposal_json = ?, created_at = datetime('now') WHERE id = ?
        `).run(JSON.stringify(proposalJson), existing.id);
        return existing.id;
      }
      const id = randomUUID();
      db.prepare(`
        INSERT INTO catalog_proposals (id, cluster_key, proposal_json, status)
        VALUES (?, ?, ?, 'draft')
      `).run(id, clusterKey, JSON.stringify(proposalJson));
      return id;
    },

    list({ status = 'draft', limit = 20 } = {}) {
      const rows = db.prepare(`
        SELECT id, cluster_key, proposal_json, status, reviewer, review_note, created_at, reviewed_at
        FROM catalog_proposals
        WHERE status = ?
        ORDER BY created_at DESC
        LIMIT ?
      `).all(status, Math.min(limit, 100));
      return rows.map(rowToProposal);
    },

    getById(id) {
      const row = db.prepare(`
        SELECT id, cluster_key, proposal_json, status, reviewer, review_note, created_at, reviewed_at
        FROM catalog_proposals WHERE id = ?
      `).get(id);
      return row ? rowToProposal(row) : null;
    },

    updateReview(id, { status, reviewer, note }) {
      const allowed = new Set(['approved', 'rejected']);
      if (!allowed.has(status)) {
        throw new Error(`Invalid proposal status: ${status}`);
      }
      db.prepare(`
        UPDATE catalog_proposals
        SET status = ?, reviewer = ?, review_note = ?, reviewed_at = datetime('now')
        WHERE id = ?
      `).run(status, reviewer ?? null, note ?? null, id);
      return this.getById(id);
    },
  };
}
