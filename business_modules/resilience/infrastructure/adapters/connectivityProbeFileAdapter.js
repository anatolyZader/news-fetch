/**
 * File-based connectivity probe ingest — JSON/JSONL under data/connectivity-probes/.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const DEFAULT_DIR = resolve('business_modules', 'resilience', 'data', 'connectivity-probes');

/**
 * @param {object} record
 * @returns {object|null}
 */
export function probeRecordToSignal(record) {
  if (!record || typeof record !== 'object') return null;
  const outage = record.outage_detected === true || record.outage === true;
  if (!outage) return null;

  return {
    source_type: 'infrastructure_probe',
    signal_type: 'connectivity_outage',
    evidence_type: 'named_institutional_fact',
    scope_level: 'quantified_or_broad',
    affected_system: record.affected_system ?? 'telecom',
    evidence: record.evidence ?? `Connectivity probe (${record.probe_source ?? 'manual'}): outage reported`,
    article_source: record.probe_source ?? 'connectivity-probe',
    article_date: record.date,
    connectivity_outage: true,
    probe_region: record.region ?? null,
    temporal_weight: 1,
    extraction_confidence: 1,
  };
}

/**
 * @param {string} filePath
 * @returns {object[]}
 */
function readProbeFile(filePath) {
  const raw = readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  if (filePath.endsWith('.jsonl')) {
    return raw.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  }
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [parsed];
}

/**
 * @param {{ probesDir?: string }} [opts]
 * @returns {import('../../domain/ports/IConnectivityProbePort.js').IConnectivityProbePort}
 */
export function createConnectivityProbeFileAdapter(opts = {}) {
  const probesDir = opts.probesDir ?? DEFAULT_DIR;

  return {
    loadProbesForDate(date, scope = 'national') {
      if (!existsSync(probesDir)) return [];

      const files = readdirSync(probesDir).filter(
        (f) => (f.endsWith('.json') || f.endsWith('.jsonl'))
          && (f.includes(date) || f === 'probes.json' || f === 'probes.jsonl'),
      );

      /** @type {object[]} */
      const records = [];
      for (const f of files) {
        try {
          const rows = readProbeFile(join(probesDir, f));
          for (const row of rows) {
            if (row.date && row.date !== date) continue;
            if (row.scope && row.scope !== scope && scope !== 'national') continue;
            records.push(row.date ? row : { ...row, date });
          }
        } catch {
          // skip unreadable probe file
        }
      }
      return records;
    },
  };
}

/**
 * @param {string} date
 * @param {string} [scope]
 * @param {{ probesDir?: string }} [opts]
 * @returns {object[]}
 */
export function loadConnectivityProbeSignals(date, scope = 'national', opts = {}) {
  const adapter = createConnectivityProbeFileAdapter(opts);
  const records = adapter.loadProbesForDate(date, scope);
  return records.map(probeRecordToSignal).filter(Boolean);
}
