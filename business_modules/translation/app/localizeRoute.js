import { parseLocale } from './parseLocale.js';
import { localizePayload } from './localePresentationService.js';

/**
 * Parse lang from request and localize payload when he/ru.
 *
 * @param {object} payload
 * @param {string} resourceId
 * @param {{ query?: object, body?: object, headers?: object }} request
 * @param {{ fingerprintExtra?: string, costDate?: string }} [opts]
 */
export async function maybeLocalize(payload, resourceId, request, opts = {}) {
  const lang = parseLocale(request);
  return localizePayload(payload, resourceId, lang, opts);
}

export { parseLocale };
