/**
 * Append-only JSONL trace store for agent runs.
 */
import { appendFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

/**
 * @param {string} reportsDir
 */
export function createTraceStore(reportsDir = 'daily_reports') {
  function tracePath(traceId) {
    const safe = String(traceId ?? '').replaceAll(/[^\w.-]/g, '_');
    return join(reportsDir, `assessment-agent-trace-${safe}.jsonl`);
  }

  return {
    /**
     * @param {string} traceId
     * @param {object} event
     */
    append(traceId, event) {
      const path = tracePath(traceId);
      mkdirSync(dirname(path), { recursive: true });
      const line = JSON.stringify({
        ts: new Date().toISOString(),
        trace_id: traceId,
        ...event,
      });
      appendFileSync(path, `${line}\n`, 'utf8');
    },

    /**
     * @param {string} traceId
     * @returns {object[]}
     */
    readAll(traceId) {
      const path = tracePath(traceId);
      if (!existsSync(path)) return [];
      return readFileSync(path, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    },

    tracePath,
  };
}

/**
 * @param {unknown} input
 */
export function hashInputs(input) {
  const raw = typeof input === 'string' ? input : JSON.stringify(input ?? {});
  return createHash('sha256').update(raw).digest('hex').slice(0, 16);
}
