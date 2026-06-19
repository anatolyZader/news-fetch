/**
 * @param {unknown} value
 * @returns {string}
 */
function formatParam(value) {
  if (value == null) return '—';
  switch (typeof value) {
    case 'string':
      return value;
    case 'number':
    case 'boolean':
    case 'bigint':
      return `${value}`;
    case 'object':
      return JSON.stringify(value);
    case 'symbol':
      return value.toString();
    case 'function':
      return value.name || 'function';
    default:
      return '';
  }
}

/**
 * Replace `{key}` placeholders in an i18n template string.
 *
 * @param {string} template
 * @param {Record<string, unknown>} [params]
 * @returns {string}
 */
export function formatTemplate(template, params = {}) {
  if (!template) return '';
  return Object.entries(params).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, formatParam(value)),
    template,
  );
}
