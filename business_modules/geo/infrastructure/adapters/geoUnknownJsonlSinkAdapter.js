import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import { IGeoUnknownSinkPort } from '../../domain/ports/IGeoUnknownSinkPort.js';

/**
 * Append-only JSONL for operational review of unmatched / ambiguous localities.
 * @param {{ filePath: string }} opts
 */
export function createGeoUnknownJsonlSinkAdapter({ filePath }) {
  return new GeoUnknownJsonlSinkAdapter(filePath);
}

class GeoUnknownJsonlSinkAdapter extends IGeoUnknownSinkPort {
  /** @param {string} filePath */
  constructor(filePath) {
    super();
    this.filePath = filePath;
  }

  /** @param {import('../../domain/value_objects/geoEnrichment.js').GeoUnknown} envelope */
  recordUnknown(envelope) {
    if (!envelope || envelope.kind !== 'unknown') return;
    mkdirSync(dirname(this.filePath), { recursive: true });
    const line = JSON.stringify({
      recorded_at: new Date().toISOString(),
      reason: envelope.reason,
      raw_name: envelope.rawName,
      geo_reference_version: envelope.geoReferenceVersion ?? null,
      source: envelope.source ?? null,
      candidates: envelope.candidates ?? null,
    });
    appendFileSync(this.filePath, `${line}\n`, 'utf8');
  }
}
