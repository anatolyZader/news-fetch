/**
 * Build omission-audit artifact from OOV JSONL + closed signal types (no agent feed).
 */
import { resolve } from 'node:path';
import { resilienceAuditsDir } from '../../domain/services/paths/outputDirs.js';
import { resolveStateStore } from '../../../../cross-cut-modules/persistence/domain/resolveStateStore.js';
import { loadOovCaptureRecords } from '../../../../cross-cut-modules/retrieval/residualObservations.js';
import { LEARNING_CAPTURE_KINDS } from '../../domain/contracts/learningCaptureKinds.js';
import { ISRAEL_NATIONAL_DISTRICT_ID } from '../../../../cross-cut-modules/geo/israelDistricts.js';

function omissionAuditFilename(scopeId, date) {
  const scope = scopeId === ISRAEL_NATIONAL_DISTRICT_ID ? 'national' : scopeId;
  return `omission-audit-${scope}-${date}.json`;
}

/**
 * @param {object[]} signals
 * @returns {Set<string>}
 */
function collectClosedSignalTypes(signals) {
  return new Set(
    (signals ?? [])
      .map((s) => s.signal_type)
      .filter(Boolean),
  );
}

/**
 * @param {object[]} records
 * @returns {Set<string>}
 */
function collectSuggestedCatalogTypes(records) {
  const out = new Set();
  for (const rec of records) {
    if (rec.suggested_type) out.add(String(rec.suggested_type));
    const lists = [
      rec.nearest_existing_types,
      rec.suggested_catalog_types,
    ];
    for (const list of lists) {
      if (!Array.isArray(list)) continue;
      for (const t of list) {
        if (t) out.add(String(t));
      }
    }
  }
  return out;
}

/**
 * @param {{
 *   date: string,
 *   reportScopeId: string,
 *   closedSignals?: object[],
 *   reportsDir?: string,
 * }} opts
 */
export function buildOmissionAuditPayload(opts) {
  const {
    date,
    reportScopeId,
    closedSignals = [],
  } = opts;

  const capturesDir = opts.capturesDir ?? opts.reportsDir;
  const records = loadOovCaptureRecords(date, capturesDir);
  const zeroSignal = records.filter(
    (r) => r.capture_kind === LEARNING_CAPTURE_KINDS.ZERO_SIGNAL_ARTICLE,
  );
  const residual = records.filter(
    (r) => r.capture_kind === LEARNING_CAPTURE_KINDS.RESIDUAL_OBSERVATION
      || (r.capture_kind === LEARNING_CAPTURE_KINDS.OPEN_OBSERVATION
        && r.observation_profile === 'residual'),
  );

  const highNovelty = residual
    .filter((r) => String(r.novelty_hint ?? '').toLowerCase() === 'high')
    .map((r) => ({
      evidence: r.evidence ?? r.behavioral_description ?? null,
      suggested_catalog_types: r.nearest_existing_types ?? r.suggested_catalog_types ?? [],
      article_url: r.article_url ?? null,
      novelty_hint: r.novelty_hint ?? null,
    }));

  const closedTypes = collectClosedSignalTypes(closedSignals);
  const learningRecords = records.filter(
    (r) => r.capture_kind === LEARNING_CAPTURE_KINDS.RESIDUAL_OBSERVATION
      || r.capture_kind === LEARNING_CAPTURE_KINDS.OPEN_OBSERVATION
      || r.capture_kind === LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
  );
  const suggested = collectSuggestedCatalogTypes(learningRecords);
  const missing = [...suggested].filter((t) => !closedTypes.has(t)).sort();

  /** @type {string[]} */
  const attention_items = [];
  if (zeroSignal.length >= 5) {
    attention_items.push(
      `high zero-signal article count: ${zeroSignal.length} articles yielded no closed catalogue signals`,
    );
  }
  for (const type of missing.slice(0, 20)) {
    attention_items.push(`possible catalogue gap: ${type} suggested but not in closed signals for ${date}`);
  }
  for (const obs of highNovelty.slice(0, 10)) {
    const hint = obs.suggested_catalog_types?.[0] ?? 'untyped observation';
    attention_items.push(`high-novelty residual: ${hint}`);
  }

  return {
    date,
    scope: reportScopeId,
    zero_signal_article_count: zeroSignal.length,
    residual_observation_count: residual.length,
    high_novelty_observations: highNovelty,
    suggested_catalog_types_missing_from_closed: missing,
    attention_items,
    generated_at: new Date().toISOString(),
  };
}

/**
 * @param {object} payload
 * @param {{ reportsDir?: string }} [opts]
 */
export function writeOmissionAuditArtifact(payload, opts = {}) {
  const reportsDir = opts.auditsDir ?? opts.reportsDir ?? resilienceAuditsDir();
  const store = resolveStateStore();
  const dir = resolve(reportsDir);
  store.mkdirSync(dir, { recursive: true });
  const path = resolve(dir, omissionAuditFilename(payload.scope, payload.date));
  store.writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return path;
}

/**
 * @param {{
 *   date: string,
 *   reportScopeId: string,
 *   closedSignals?: object[],
 *   reportsDir?: string,
 * }} opts
 */
export function buildAndWriteOmissionAudit(opts) {
  const payload = buildOmissionAuditPayload(opts);
  const path = writeOmissionAuditArtifact(payload, opts);
  const summary = {
    zero_signal_article_count: payload.zero_signal_article_count,
    residual_observation_count: payload.residual_observation_count,
    high_novelty_count: payload.high_novelty_observations.length,
    missing_catalog_type_count: payload.suggested_catalog_types_missing_from_closed.length,
    attention_item_count: payload.attention_items.length,
    artifact_path: path,
  };
  return { payload, path, summary };
}
