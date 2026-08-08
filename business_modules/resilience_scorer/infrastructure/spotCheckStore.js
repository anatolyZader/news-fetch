/**
 * Append-only JSONL store for extraction spot-check samples (user review
 * of the high-confidence path). One file per report date, records stamped with
 * ids/timestamps here; sampling itself is domain logic (spotCheckSampler.js).
 * Idempotent per (report_date, scope): a re-run of the same report does not
 * duplicate its sample. Convention mirrors signal-flags/oov-capture JSONL.
 */
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveStateStore } from '../../../cross-cut-modules/persistence/domain/resolveStateStore.js';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
export const DEFAULT_SPOT_CHECKS_DIR = join(
  REPO_ROOT, 'business_modules', 'resilience_scorer', 'data', 'spot_checks',
);

/**
 * @param {string} [spotChecksDir]
 * @returns {{ appendSample(reportDate: string, scopeId: string, records: object[]): object[], listForDate(date: string): object[] }}
 */
export function createSpotCheckStore(spotChecksDir = DEFAULT_SPOT_CHECKS_DIR) {
  function fileForDate(date) {
    return join(spotChecksDir, `spot-checks-${date}.jsonl`);
  }

  function listForDate(date) {
    let raw;
    try {
      raw = resolveStateStore().readFileSync(fileForDate(date), 'utf-8');
    } catch {
      return [];
    }
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  }

  function appendSample(reportDate, scopeId, records) {
    if (!records?.length) return [];
    const existing = listForDate(reportDate);
    if (existing.some((r) => r.scope === scopeId)) return [];

    const sampledAt = new Date().toISOString();
    const entries = records.map((record) => ({
      spot_check_id: `sc_${reportDate}_${randomUUID().slice(0, 8)}`,
      sampled_at: sampledAt,
      ...record,
    }));
    const store = resolveStateStore();
    const path = fileForDate(reportDate);
    store.mkdirSync(dirname(path), { recursive: true });
    store.appendFileSync(path, entries.map((e) => `${JSON.stringify(e)}\n`).join(''));
    return entries;
  }

  return { appendSample, listForDate };
}
