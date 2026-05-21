import { CONTENT_KIND_OSINT, SOURCE_TYPE_SOCIAL } from '../value_objects/socialPlatform.js';

/**
 * @param {unknown} bundle
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateOsintBundle(bundle) {
  const errors = [];
  if (!bundle || typeof bundle !== 'object') {
    return { valid: false, errors: ['bundle must be an object'] };
  }

  if (bundle.source_type !== SOURCE_TYPE_SOCIAL) {
    errors.push(`source_type must be "${SOURCE_TYPE_SOCIAL}"`);
  }
  if (bundle.content_kind !== CONTENT_KIND_OSINT) {
    errors.push(`content_kind must be "${CONTENT_KIND_OSINT}"`);
  }
  if (!bundle.date || !/^\d{4}-\d{2}-\d{2}$/.test(String(bundle.date))) {
    errors.push('date must be YYYY-MM-DD');
  }
  if (!Array.isArray(bundle.findings)) {
    errors.push('findings must be an array');
  } else {
    for (const [i, f] of bundle.findings.entries()) {
      if (!f?.quote_original) errors.push(`findings[${i}] missing quote_original`);
      if (!f?.platform) errors.push(`findings[${i}] missing platform`);
    }
  }

  return { valid: errors.length === 0, errors };
}
