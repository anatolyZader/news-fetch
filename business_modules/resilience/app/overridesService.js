import { COMPONENT_IDS } from '../domain/services/behaviorSignals.js';

const VALID_KINDS = new Set(['challenge_score', 'flag_signal', 'dispute_evidence']);
const VALID_SCOPES = new Set(['national', 'north']);
const MAX_NOTE_CHARS = 500;

/**
 * Application service for reviewer overrides on resilience reports.
 * Validates incoming overrides and delegates persistence to the store.
 *
 * @param {object} deps
 * @param {ReturnType<typeof import('../infrastructure/overridesStore.js').createOverridesStore>} deps.store
 */
export function createOverridesService({ store }) {
  function validate(input) {
    const errors = [];

    const { uid, report_date, component_id, kind, scope = 'national' } = input ?? {};

    if (!uid || typeof uid !== 'string') errors.push('uid_required');
    if (!report_date || !/^\d{4}-\d{2}-\d{2}$/.test(report_date)) errors.push('report_date_invalid');
    if (!component_id || !COMPONENT_IDS.includes(component_id)) errors.push('component_id_invalid');
    if (!kind || !VALID_KINDS.has(kind)) errors.push('kind_invalid');
    if (!VALID_SCOPES.has(scope)) errors.push('scope_invalid');

    const note = input?.note;
    if (note != null && typeof note !== 'string') errors.push('note_must_be_string');
    if (typeof note === 'string' && note.length > MAX_NOTE_CHARS) errors.push('note_too_long');

    if (kind === 'challenge_score') {
      const proposed = input?.proposed?.score;
      if (typeof proposed !== 'number' || !Number.isInteger(proposed) || proposed < 1 || proposed > 10) {
        errors.push('proposed_score_invalid');
      }
    }

    return errors;
  }

  function create(input) {
    const errors = validate(input);
    if (errors.length > 0) {
      const err = new Error('validation_failed');
      err.code = 'validation_failed';
      err.details = errors;
      throw err;
    }
    return store.append({
      uid: input.uid,
      email: input.email ?? null,
      report_date: input.report_date,
      scope: input.scope ?? 'national',
      component_id: input.component_id,
      kind: input.kind,
      original: input.original ?? null,
      proposed: input.proposed ?? null,
      note: typeof input.note === 'string' ? input.note : null,
    });
  }

  function list({ date, scope }) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const err = new Error('date_invalid');
      err.code = 'date_invalid';
      throw err;
    }
    return store.listForDate(date, { scope });
  }

  function countByComponent({ date, scope }) {
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return {};
    return store.countByComponent(date, { scope });
  }

  return { create, list, countByComponent, validate };
}

export const OVERRIDES_VALID_KINDS = VALID_KINDS;
export const OVERRIDES_MAX_NOTE_CHARS = MAX_NOTE_CHARS;
