import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { runInTransaction } from './sqliteTransaction.js';

const DDL = `
CREATE TABLE IF NOT EXISTS pipeline_runs (
  run_key          TEXT PRIMARY KEY,
  report_date      TEXT NOT NULL,
  report_scope_id  TEXT NOT NULL,
  stages_json      TEXT NOT NULL DEFAULT '{}',
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * @param {string} dbPath
 */
export function createPipelineRunStore(dbPath) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(DDL);

  const upsert = db.prepare(`
    INSERT INTO pipeline_runs (run_key, report_date, report_scope_id, stages_json, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(run_key) DO UPDATE SET
      stages_json = excluded.stages_json,
      updated_at = datetime('now')
  `);
  const getOne = db.prepare(`
    SELECT run_key, report_date, report_scope_id, stages_json FROM pipeline_runs WHERE run_key = ?
  `);

  function readStages(runKey) {
    const row = getOne.get(runKey);
    if (!row) return null;
    return {
      runKey: row.run_key,
      reportDate: row.report_date,
      reportScopeId: row.report_scope_id,
      stages: JSON.parse(row.stages_json || '{}'),
    };
  }

  function writeStages(runKey, reportDate, reportScopeId, stages) {
    runInTransaction(db, () => {
      upsert.run(runKey, reportDate, reportScopeId, JSON.stringify(stages));
    });
  }

  return {
    startRun({ runKey, reportDate, reportScopeId }) {
      writeStages(runKey, reportDate, reportScopeId, {});
    },
    completeStage(runKey, stage, versions = undefined) {
      const rec = readStages(runKey);
      if (!rec) return;
      const stages = { ...rec.stages };
      stages[stage] = {
        status: 'completed',
        at: new Date().toISOString(),
        ...(versions ? { versions } : {}),
      };
      writeStages(runKey, rec.reportDate, rec.reportScopeId, stages);
    },
    failStage(runKey, stage, error) {
      const rec = readStages(runKey);
      if (!rec) return;
      const stages = { ...rec.stages };
      stages[stage] = {
        status: 'failed',
        at: new Date().toISOString(),
        error: String(error).slice(0, 500),
      };
      writeStages(runKey, rec.reportDate, rec.reportScopeId, stages);
    },
    getRun(runKey) {
      return readStages(runKey);
    },
    listByDate(reportDate) {
      const rows = db.prepare(
        'SELECT run_key, report_date, report_scope_id, stages_json FROM pipeline_runs WHERE report_date = ? ORDER BY run_key',
      ).all(reportDate);
      return rows.map((row) => ({
        runKey: row.run_key,
        reportDate: row.report_date,
        reportScopeId: row.report_scope_id,
        stages: JSON.parse(row.stages_json || '{}'),
      }));
    },
  };
}
