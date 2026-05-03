import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';

/**
 * Append-only JSONL store for reviewer overrides on resilience reports.
 *
 * Each line is one override record:
 *   {
 *     id, uid, email,
 *     report_date, scope,
 *     component_id,
 *     kind: 'challenge_score' | 'flag_signal' | 'dispute_evidence',
 *     original: { score? },
 *     proposed: { score? },
 *     note,
 *     created_at,
 *   }
 *
 * File path: <baseDir>/<report_date>.jsonl. baseDir defaults to `reports/overrides`
 * relative to the workspace root, but is injectable for tests.
 */

export function createOverridesStore({ baseDir } = {}) {
  const root = baseDir ?? resolve(process.cwd(), 'reports', 'overrides');

  function fileFor(date) {
    return resolve(root, `${date}.jsonl`);
  }

  function ensureDir(filePath) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }

  function append(record) {
    const id = record.id ?? randomUUID();
    const created_at = record.created_at ?? new Date().toISOString();
    const enriched = { ...record, id, created_at };
    const filePath = fileFor(enriched.report_date);
    ensureDir(filePath);
    appendFileSync(filePath, JSON.stringify(enriched) + '\n', 'utf8');
    return enriched;
  }

  function listForDate(date, { scope } = {}) {
    const filePath = fileFor(date);
    if (!existsSync(filePath)) return [];
    const lines = readFileSync(filePath, 'utf8').split('\n').filter(Boolean);
    const out = [];
    for (const line of lines) {
      try {
        const rec = JSON.parse(line);
        if (scope && rec.scope !== scope) continue;
        out.push(rec);
      } catch {
        /* skip malformed line */
      }
    }
    return out;
  }

  function countByComponent(date, { scope } = {}) {
    const all = listForDate(date, { scope });
    const counts = {};
    for (const rec of all) {
      const id = rec.component_id;
      if (!id) continue;
      counts[id] = (counts[id] || 0) + 1;
    }
    return counts;
  }

  return { append, listForDate, countByComponent, fileFor };
}
