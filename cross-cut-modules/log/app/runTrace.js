/**
 * Per-run decision-trace recorder ("flight recorder").
 *
 * Created once per CLI run, threaded through the extraction pipeline, and flushed
 * on finish() to two artifacts:
 *   - <outBase>.jsonl  machine-readable ordered events (diffable between runs)
 *   - <outBase>.md     readable narrative (rendered via runTraceRender)
 *
 * No-op when `enabled` is false: methods do nothing and finish() returns null.
 */
import { writeFileSync } from 'node:fs';
import { appendJsonlRecord, ensureParentDir } from '../infrastructure/jsonlLog.js';
import { resolveRunTracePath } from '../infrastructure/logPaths.js';
import { renderRunTraceMarkdown } from '../domain/runTraceRender.js';

function nowHHMM() {
  return new Date().toTimeString().slice(0, 5).replace(':', '');
}

function defaultOutBase(run, sourceType, date) {
  const stem = [run, sourceType, date].filter(Boolean).join('-');
  return resolveRunTracePath(`${stem}-${nowHHMM()}`);
}

/**
 * @param {{
 *   run?: string,
 *   sourceType?: string|null,
 *   date?: string|null,
 *   outBase?: string|null,
 *   enabled?: boolean,
 * }} [opts]
 */
export function createRunTrace({
  run = 'run',
  sourceType = null,
  date = null,
  outBase = null,
  enabled = true,
} = {}) {
  const events = [];
  const startedAt = Date.now();
  let seq = 0;
  const base = outBase ?? defaultOutBase(run, sourceType, date);

  function push(type, data) {
    if (!enabled) return;
    events.push({ seq: seq++, t_ms: Date.now() - startedAt, type, ...data });
  }

  return {
    enabled,
    outBase: base,
    /** Record one per-article extraction record. */
    item(record) {
      push('item', record ?? {});
    },
    /** Record an arbitrary structured event (e.g. rejected candidates). */
    event(type, data = {}) {
      push(type, data);
    },
    /** Flush to .jsonl + .md. Returns paths, or null when disabled. */
    finish() {
      if (!enabled) return null;
      const jsonlPath = `${base}.jsonl`;
      const mdPath = `${base}.md`;
      ensureParentDir(jsonlPath);
      for (const e of events) appendJsonlRecord(jsonlPath, e);
      writeFileSync(mdPath, renderRunTraceMarkdown({ run, sourceType, date, events }), 'utf8');
      return { jsonlPath, mdPath };
    },
  };
}

export default createRunTrace;
