import { createGeoWiring } from './createGeoWiring.js';
import { attachGeoToSignals } from './attachGeoToSignals.js';
import { buildReferenceNameIndex } from './referenceNameIndex.js';
import { shouldAttachGeoToSignal } from './geoAttachPolicy.js';

/**
 * Attach resolved geo envelopes to resilience signals via geoService (not keyword north scoping).
 * @param {Array<object>} signals
 * @param {{
 *   rootDir: string,
 *   unknownSourceType?: string,
 *   reporterSubregionHint?: string|null,
 * }} opts
 * @returns {{ signals: object[], attached: number, resolved: number, unknown: number }}
 */
export function enrichSignalsWithGeo(signals, opts) {
  const list = Array.isArray(signals) ? signals : [];
  const needGeo = list.filter((s) => shouldAttachGeoToSignal(s));
  if (needGeo.length === 0) {
    return { signals: list, attached: 0, resolved: 0, unknown: 0 };
  }

  const { geoEnrichmentPort } = createGeoWiring({
    rootDir: opts.rootDir,
    unknownSourceType: opts.unknownSourceType ?? 'enrich-signals',
  });
  const nameIndex = buildReferenceNameIndex(opts.rootDir);

  const byType = new Map();
  for (const s of needGeo) {
    const st = s.source_type ?? '_unknown';
    if (!byType.has(st)) byType.set(st, []);
    byType.get(st).push(s);
  }

  const merged = new Map();
  let attached = 0;
  let resolved = 0;
  let unknown = 0;

  for (const [sourceType, subset] of byType) {
    const hint =
      opts.reporterSubregionHint ??
      subset.find((s) => s?.pbo_subregion_id || s?.region)?.pbo_subregion_id ??
      subset.find((s) => s?.region)?.region ??
      undefined;

    const { signals: enriched, attached: a, resolved: r, unknown: u } = attachGeoToSignals(
      subset,
      geoEnrichmentPort,
      {
        sourceType: sourceType === '_unknown' ? undefined : sourceType,
        nameIndex,
        reporterSubregionHint: hint ? String(hint).trim() : undefined,
      },
    );
    attached += a;
    resolved += r;
    unknown += u;
    for (const s of enriched) {
      merged.set(signalGeoMergeKey(s), s);
    }
  }

  const out = list.map((s) => merged.get(signalGeoMergeKey(s)) ?? s);
  return { signals: out, attached, resolved, unknown };
}

function signalGeoMergeKey(s) {
  return `${s?.source_type ?? ''}|${s?.signal_type ?? ''}|${s?.evidence ?? ''}|${s?.article_url ?? s?.article_index ?? ''}`;
}
