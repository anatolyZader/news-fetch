/**
 * Load residual / open observations from OOV capture JSONL for agent investigation.
 */
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { resolveStateStore } from '../persistence/domain/resolveStateStore.js';
import { LEARNING_CAPTURE_KINDS } from '../learningCapture/kinds.js';
import { COMPONENT_IDS } from '../resilience-contracts/componentIds.js';

const INVESTIGATION_KINDS = new Set([
  LEARNING_CAPTURE_KINDS.RESIDUAL_OBSERVATION,
  LEARNING_CAPTURE_KINDS.OPEN_OBSERVATION,
  LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE,
]);

/**
 * @param {string} date YYYY-MM-DD
 * @param {string} [reportsDir]
 */
export function loadOovCaptureRecords(date, reportsDir = 'daily_reports') {
  const store = resolveStateStore();
  const path = resolve(reportsDir, `oov-capture-${date}.jsonl`);
  if (!store.existsSync(path)) return [];
  try {
    const text = store.readFileSync(path, 'utf8');
    return text
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

/**
 * Residual + open observation records for agent blackboard (not scoring).
 * @param {string} date
 * @param {object} [opts]
 */
export function loadResidualObservationsForAgent(date, opts = {}) {
  const reportsDir = opts.reportsDir ?? 'daily_reports';
  const records = loadOovCaptureRecords(date, reportsDir);
  return records.filter((r) => {
    const kind = r.capture_kind ?? LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE;
    if (kind === LEARNING_CAPTURE_KINDS.RESIDUAL_OBSERVATION
      || kind === LEARNING_CAPTURE_KINDS.OPEN_OBSERVATION) {
      return true;
    }
    if (opts.includeUnknownTypes && kind === LEARNING_CAPTURE_KINDS.UNKNOWN_TYPE) {
      return true;
    }
    return false;
  });
}

/**
 * @param {object} record
 */
export function observationText(record) {
  return String(
    record.behavioral_description
    ?? record.evidence
    ?? record.snippet
    ?? record.suggested_type
    ?? '',
  ).trim();
}

/**
 * Heuristic component routing for open/residual observations.
 * @param {object} record
 */
export function mapObservationToComponent(record) {
  const text = observationText(record).toLowerCase();
  const hints = [
    ['information_communication', ['media', 'message', 'alert', 'communication', 'news', 'telegram']],
    ['leadership', ['mayor', 'municipal', 'government', 'leadership', 'coordination']],
    ['wellbeing_at_risk', ['mental', 'trauma', 'anxiety', 'wellbeing', 'stress']],
    ['lifesaving_behavior', ['shelter', 'safety', 'emergency', 'evacuat']],
    ['functional_continuity', ['service', 'infrastructure', 'continuity', 'supply']],
    ['community_capital', ['volunteer', 'mutual aid', 'community']],
    ['belonging_solidarity', ['solidarity', 'cohesion', 'belonging']],
    ['narrative', ['narrative', 'discourse', 'public']],
  ];
  for (const [compId, terms] of hints) {
    if (terms.some((t) => text.includes(t))) return compId;
  }
  return 'narrative';
}

/**
 * Group observations by component_id for epistemic mass hints.
 * @param {object[]} observations
 */
export function groupObservationsByComponent(observations = []) {
  const byComponent = Object.fromEntries(COMPONENT_IDS.map((id) => [id, []]));
  for (const obs of observations) {
    const compId = obs.component_id ?? mapObservationToComponent(obs);
    if (byComponent[compId]) byComponent[compId].push(obs);
    else byComponent.narrative.push(obs);
  }
  return byComponent;
}

function observationDedupeKey(obs) {
  if (obs.observation_id) return `id:${obs.observation_id}`;
  const text = observationText(obs).slice(0, 120);
  return `ev:${createHash('sha256').update(text).digest('hex').slice(0, 16)}`;
}

/**
 * Merge jsonl residuals + pre-routed pipeline bundles for agent graph.
 * @param {string} date
 * @param {object} [opts]
 * @param {object[]} [opts.preRouted] pipeline observations with component_id
 * @param {object[]} [opts.bundles] optional pre-loaded bundle entries
 */
export function loadOpenObservationsForAgent(date, opts = {}) {
  const jsonlRecords = loadResidualObservationsForAgent(date, opts).map((rec) => ({
    ...rec,
    observation_id: rec.observation_id ?? rec.id ?? `residual-${observationDedupeKey(rec)}`,
    source: 'residual_jsonl',
    component_id: rec.component_id ?? mapObservationToComponent(rec),
  }));

  const preRouted = (opts.preRouted ?? []).map((obs) => ({
    ...obs,
    source: obs.source ?? 'pipeline',
  }));

  const seen = new Set();
  const merged = [];
  for (const obs of [...preRouted, ...jsonlRecords]) {
    const key = observationDedupeKey(obs);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(obs);
  }
  return merged;
}

export { INVESTIGATION_KINDS,  };

export {LEARNING_CAPTURE_KINDS} from '../learningCapture/kinds.js';