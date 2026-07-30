/**
 * Append-only JSONL store for operator signal flags raised from chat
 * (propose_signal_flag → user confirm → append). Flags are immutable events
 * mined later by the catalog-harvest workflow, like oov-capture-*.jsonl.
 * The default directory lives under resilience_scorer/data by design — this is
 * a data-path convention only (no code import into that module).
 */
import { join, dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { resolveStateStore } from '../../../cross-cut-modules/persistence/domain/resolveStateStore.js';

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..');
export const DEFAULT_SIGNAL_FLAGS_DIR = join(
  REPO_ROOT, 'business_modules', 'resilience_scorer', 'data', 'signal_flags',
);

function getStore(deps = {}) {
  return resolveStateStore(deps);
}

/**
 * @param {string} [flagsDir]
 * @returns {{ append(record: object): object, listForDate(date: string): object[] }}
 */
export function createSignalFlagStore(flagsDir = DEFAULT_SIGNAL_FLAGS_DIR) {
  function fileForDate(date) {
    return join(flagsDir, `signal-flags-${date}.jsonl`);
  }

  return {
    append(record) {
      const flaggedAt = new Date().toISOString();
      const day = flaggedAt.slice(0, 10);
      const entry = {
        flag_id: `sf_${day}_${randomUUID().slice(0, 8)}`,
        flagged_at: flaggedAt,
        user: record.user ?? '',
        signal_id: record.signal_id ?? null,
        source_ref: record.source_ref ?? null,
        signal_type: record.signal_type ?? null,
        date: record.date ?? null,
        source_type: record.source_type ?? null,
        reason: record.reason ?? null,
        note: record.note ?? '',
        session_id: record.session_id ?? null,
      };
      const store = getStore();
      const path = fileForDate(day);
      store.mkdirSync(dirname(path), { recursive: true });
      store.appendFileSync(path, `${JSON.stringify(entry)}\n`);
      return entry;
    },

    listForDate(date) {
      let raw;
      try {
        raw = getStore().readFileSync(fileForDate(date), 'utf-8');
      } catch {
        return [];
      }
      const out = [];
      for (const line of raw.split('\n')) {
        if (!line.trim()) continue;
        try {
          out.push(JSON.parse(line));
        } catch { /* skip corrupt lines */ }
      }
      return out;
    },
  };
}
