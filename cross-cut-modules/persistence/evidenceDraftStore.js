/**
 * SQLite persistence for user evidence drafts (Node built-in node:sqlite).
 * @see https://nodejs.org/api/sqlite.html
 */
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DDL = `
CREATE TABLE IF NOT EXISTS evidence_drafts (
  owner_key TEXT PRIMARY KEY NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS evidence_submissions (
  id INTEGER PRIMARY KEY,
  owner_key TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('single_evidence_piece', 'url_to_important_evidence')),
  detected_url TEXT,
  ingest_status TEXT NOT NULL DEFAULT 'queued' CHECK(ingest_status IN ('queued', 'processed', 'failed')),
  ingest_details TEXT,
  analysis_status TEXT NOT NULL DEFAULT 'queued' CHECK(analysis_status IN ('queued', 'processed', 'failed')),
  analysis_details TEXT,
  analysis_json TEXT,
  extracted_content_json TEXT,
  analyzed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * @param {string} dbPath Absolute path to SQLite file (parent dirs created if needed)
 */
export function createEvidenceDraftStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);
  try {
    const cols = db.prepare(`PRAGMA table_info(evidence_submissions)`).all();
    const hasIngestStatus = cols.some((c) => c.name === 'ingest_status');
    const hasIngestDetails = cols.some((c) => c.name === 'ingest_details');
    const hasRawContent = cols.some((c) => c.name === 'raw_content');
    const hasAnalysisStatus = cols.some((c) => c.name === 'analysis_status');
    const hasAnalysisDetails = cols.some((c) => c.name === 'analysis_details');
    const hasAnalysisJson = cols.some((c) => c.name === 'analysis_json');
    const hasExtractedContentJson = cols.some((c) => c.name === 'extracted_content_json');
    const hasAnalyzedAt = cols.some((c) => c.name === 'analyzed_at');
    if (!hasRawContent) {
      db.exec("ALTER TABLE evidence_submissions ADD COLUMN raw_content TEXT NOT NULL DEFAULT ''");
    }
    if (!hasIngestStatus) {
      db.exec(
        "ALTER TABLE evidence_submissions ADD COLUMN ingest_status TEXT NOT NULL DEFAULT 'queued' CHECK(ingest_status IN ('queued', 'processed', 'failed'))",
      );
    }
    if (!hasIngestDetails) {
      db.exec('ALTER TABLE evidence_submissions ADD COLUMN ingest_details TEXT');
    }
    if (!hasAnalysisStatus) {
      db.exec(
        "ALTER TABLE evidence_submissions ADD COLUMN analysis_status TEXT NOT NULL DEFAULT 'queued' CHECK(analysis_status IN ('queued', 'processed', 'failed'))",
      );
    }
    if (!hasAnalysisDetails) {
      db.exec('ALTER TABLE evidence_submissions ADD COLUMN analysis_details TEXT');
    }
    if (!hasAnalysisJson) {
      db.exec('ALTER TABLE evidence_submissions ADD COLUMN analysis_json TEXT');
    }
    if (!hasExtractedContentJson) {
      db.exec('ALTER TABLE evidence_submissions ADD COLUMN extracted_content_json TEXT');
    }
    if (!hasAnalyzedAt) {
      db.exec('ALTER TABLE evidence_submissions ADD COLUMN analyzed_at TEXT');
    }
  } catch {
    /* ignore migration check errors */
  }
  try {
    db.exec('PRAGMA journal_mode = WAL;');
  } catch {
    /* ignore if unsupported */
  }

  const getStmt = db.prepare('SELECT content, updated_at FROM evidence_drafts WHERE owner_key = ?');
  const upsertStmt = db.prepare(`
    INSERT INTO evidence_drafts (owner_key, content, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(owner_key) DO UPDATE SET
      content = excluded.content,
      updated_at = datetime('now')
  `);
  const insertSubmissionStmt = db.prepare(`
    INSERT INTO evidence_submissions (owner_key, raw_content, content, category, detected_url, ingest_status, ingest_details, created_at)
    VALUES (?, ?, ?, ?, ?, 'queued', NULL, datetime('now'))
  `);
  const updateSubmissionIngestStmt = db.prepare(`
    UPDATE evidence_submissions
    SET ingest_status = ?, ingest_details = ?
    WHERE id = ? AND owner_key = ?
  `);
  const updateSubmissionAnalysisStmt = db.prepare(`
    UPDATE evidence_submissions
    SET analysis_status = ?, analysis_details = ?, analysis_json = ?, analyzed_at = datetime('now')
    WHERE id = ? AND owner_key = ?
  `);
  const updateSubmissionExtractedContentStmt = db.prepare(`
    UPDATE evidence_submissions
    SET extracted_content_json = ?
    WHERE id = ? AND owner_key = ?
  `);
  const lastSubmissionStmt = db.prepare(`
    SELECT id, owner_key, raw_content, content, category, detected_url, created_at
    FROM evidence_submissions
    WHERE owner_key = ?
    ORDER BY id DESC
    LIMIT 1
  `);
  const getSubmissionByIdStmt = db.prepare(`
    SELECT
      id,
      owner_key,
      raw_content,
      content,
      category,
      detected_url,
      ingest_status,
      ingest_details,
      analysis_status,
      analysis_details,
      analysis_json,
      extracted_content_json,
      analyzed_at,
      created_at
    FROM evidence_submissions
    WHERE id = ? AND owner_key = ?
    LIMIT 1
  `);
  const getLatestSubmissionStmt = db.prepare(`
    SELECT
      id,
      owner_key,
      raw_content,
      content,
      category,
      detected_url,
      ingest_status,
      ingest_details,
      analysis_status,
      analysis_details,
      analysis_json,
      extracted_content_json,
      analyzed_at,
      created_at
    FROM evidence_submissions
    WHERE owner_key = ?
    ORDER BY id DESC
    LIMIT 1
  `);
  const getRecentSubmissionsStmt = db.prepare(`
    SELECT
      id,
      owner_key,
      raw_content,
      content,
      category,
      detected_url,
      ingest_status,
      ingest_details,
      analysis_status,
      analysis_details,
      analysis_json,
      extracted_content_json,
      analyzed_at,
      created_at
    FROM evidence_submissions
    WHERE owner_key = ?
    ORDER BY id DESC
    LIMIT ?
  `);

  function rowToSubmission(row) {
    if (!row) return null;
    let analysisJson = null;
    if (typeof row.analysis_json === 'string' && row.analysis_json.trim().length > 0) {
      try {
        analysisJson = JSON.parse(row.analysis_json);
      } catch {
        analysisJson = null;
      }
    }
    let extractedContentJson = null;
    if (typeof row.extracted_content_json === 'string' && row.extracted_content_json.trim().length > 0) {
      try {
        extractedContentJson = JSON.parse(row.extracted_content_json);
      } catch {
        extractedContentJson = null;
      }
    }
    return {
      id: Number(row.id),
      ownerKey: String(row.owner_key),
      rawContent: typeof row.raw_content === 'string' ? row.raw_content : '',
      content: typeof row.content === 'string' ? row.content : '',
      category: typeof row.category === 'string' ? row.category : '',
      detectedUrl: row.detected_url != null ? String(row.detected_url) : null,
      ingestStatus: typeof row.ingest_status === 'string' ? row.ingest_status : 'queued',
      ingestDetails: row.ingest_details != null ? String(row.ingest_details) : null,
      analysisStatus: typeof row.analysis_status === 'string' ? row.analysis_status : 'queued',
      analysisDetails: row.analysis_details != null ? String(row.analysis_details) : null,
      analysisJson,
      extractedContentJson,
      analyzedAt: row.analyzed_at != null ? String(row.analyzed_at) : null,
      createdAt: row.created_at != null ? String(row.created_at) : null,
    };
  }

  return {
    /**
     * @param {string} ownerKey
     * @returns {{ content: string, updatedAt: string | null }}
     */
    get(ownerKey) {
      const row = getStmt.get(ownerKey);
      if (!row) return { content: '', updatedAt: null };
      return {
        content: typeof row.content === 'string' ? row.content : '',
        updatedAt: row.updated_at != null ? String(row.updated_at) : null,
      };
    },

    /**
     * @param {string} ownerKey
     * @param {string} content
     * @returns {{ content: string, updatedAt: string | null }}
     */
    save(ownerKey, content) {
      upsertStmt.run(ownerKey, content);
      const row = getStmt.get(ownerKey);
      return {
        content: typeof row?.content === 'string' ? row.content : '',
        updatedAt: row?.updated_at != null ? String(row.updated_at) : null,
      };
    },

    /**
     * @param {string} ownerKey
     * @param {string} content
     * @param {'single_evidence_piece'|'url_to_important_evidence'} category
     * @param {string|null} detectedUrl
     * @returns {{ id: number, ownerKey: string, rawContent: string, content: string, category: string, detectedUrl: string | null, createdAt: string | null }}
     */
    submit(ownerKey, content, category, detectedUrl = null) {
      insertSubmissionStmt.run(ownerKey, content, content, category, detectedUrl);
      const row = lastSubmissionStmt.get(ownerKey);
      return {
        id: Number(row?.id ?? 0),
        ownerKey: typeof row?.owner_key === 'string' ? row.owner_key : ownerKey,
        rawContent: typeof row?.raw_content === 'string' ? row.raw_content : content,
        content: typeof row?.content === 'string' ? row.content : content,
        category: typeof row?.category === 'string' ? row.category : category,
        detectedUrl: row?.detected_url != null ? String(row.detected_url) : null,
        createdAt: row?.created_at != null ? String(row.created_at) : null,
      };
    },

    /**
     * @param {{ submissionId: number, ownerKey: string, status: 'queued'|'processed'|'failed', details?: string|null }} p
     */
    setSubmissionIngestStatus({ submissionId, ownerKey, status, details = null }) {
      updateSubmissionIngestStmt.run(status, details, submissionId, ownerKey);
    },

    /**
     * @param {{ submissionId: number, ownerKey: string, status: 'queued'|'processed'|'failed', details?: string|null, analysisJson?: object|null }} p
     */
    setSubmissionAnalysisResult({ submissionId, ownerKey, status, details = null, analysisJson = null }) {
      const json = analysisJson != null ? JSON.stringify(analysisJson) : null;
      updateSubmissionAnalysisStmt.run(status, details, json, submissionId, ownerKey);
    },

    /**
     * @param {{ submissionId: number, ownerKey: string, extractedContentJson: object|null }} p
     */
    setSubmissionExtractedContent({ submissionId, ownerKey, extractedContentJson }) {
      const json = extractedContentJson != null ? JSON.stringify(extractedContentJson) : null;
      updateSubmissionExtractedContentStmt.run(json, submissionId, ownerKey);
    },

    /**
     * @param {{ submissionId: number, ownerKey: string }} p
     */
    getSubmissionById({ submissionId, ownerKey }) {
      const row = getSubmissionByIdStmt.get(submissionId, ownerKey);
      return rowToSubmission(row);
    },

    /**
     * @param {{ ownerKey: string }} p
     */
    getLatestSubmission({ ownerKey }) {
      const row = getLatestSubmissionStmt.get(ownerKey);
      return rowToSubmission(row);
    },

    getRecentSubmissions({ ownerKey, limit = 10 }) {
      const rows = getRecentSubmissionsStmt.all(ownerKey, limit);
      return rows.map(rowToSubmission);
    },
  };
}
