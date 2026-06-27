import { formatTemplate } from './i18nFormat.js';

/**
 * @typedef {{ kind: 'i18n', key: string, params?: Record<string, unknown> }}
 *   | {{ kind: 'text', value: string, original?: string | null }}
 *   | {{ kind: 'legacy_key', key: string, params?: Record<string, unknown> }}
 *   | {{ kind: 'legacy_text', value: string | null, original?: string | null }}
 *   | string
 *   | null
 *   | undefined
 * } DisplayTextField
 */

/**
 * @param {DisplayTextField} field
 * @param {(key: string, params?: Record<string, unknown>) => string} t
 * @param {{ preferOriginal?: boolean }} [opts]
 * @returns {string}
 */
export function resolveDisplayText(field, t, opts = {}) {
  if (field == null) return '';
  if (typeof field === 'string') return field;

  if (field.kind === 'i18n' || field.kind === 'legacy_key') {
    const params = field.params ?? {};
    return Object.keys(params).length ? formatTemplate(t(field.key), params) : t(field.key);
  }

  if (field.kind === 'text' || field.kind === 'legacy_text') {
    const original = field.original ?? null;
    const value = field.value ?? '';
    if (opts.preferOriginal && original) return original;
    return value || original || '';
  }

  return '';
}

/**
 * Normalize action compass / attention hybrid fields from API payloads.
 *
 * @param {{ title_key?: string, title?: DisplayTextField, detail_params?: object, why_now_key?: string, why_now_text?: string, why_now_textOriginal?: string, why_now_params?: object }} action
 */
export function resolveActionTitle(action, t) {
  if (action.title && typeof action.title === 'object' && action.title.kind) {
    return resolveDisplayText(action.title, t);
  }
  if (action.title_key) {
    return formatTemplate(t(action.title_key), action.detail_params ?? {});
  }
  return '';
}

/**
 * @param {object} action
 * @param {(key: string, params?: Record<string, unknown>) => string} t
 * @param {{ preferOriginal?: boolean }} [opts]
 */
export function resolveActionWhyNow(action, t, opts = {}) {
  if (action.why_now && typeof action.why_now === 'object' && action.why_now.kind) {
    return resolveDisplayText(action.why_now, t, opts);
  }
  if (action.why_now_text) {
    if (opts.preferOriginal && action.why_now_textOriginal) return action.why_now_textOriginal;
    return action.why_now_text;
  }
  if (action.why_now_key) {
    return formatTemplate(t(action.why_now_key), action.why_now_params ?? {});
  }
  return '';
}
