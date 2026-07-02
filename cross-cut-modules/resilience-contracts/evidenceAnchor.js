/**
 * Stable DOM anchor ids linking narrative citations to evidence list rows.
 */

/**
 * @param {string|null|undefined} ref
 * @returns {string}
 */
export function encodeRefForAnchor(ref) {
  return String(ref ?? '')
    .trim()
    .replace(/^@+/, '')
    .replaceAll('@', '-')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 120);
}

/**
 * @param {string|null|undefined} componentId
 * @param {string|null|undefined} ref
 * @returns {string}
 */
export function evidenceAnchorId(componentId, ref) {
  const comp = String(componentId ?? 'component').trim().replace(/[^a-zA-Z0-9_-]+/g, '-');
  const encoded = encodeRefForAnchor(ref);
  if (!encoded) return `evidence-${comp}`;
  return `evidence-${comp}-${encoded}`;
}

/**
 * @param {string|null|undefined} componentId
 * @param {string|null|undefined} ref
 * @returns {string}
 */
export function evidenceAnchorHref(componentId, ref) {
  return `#${evidenceAnchorId(componentId, ref)}`;
}

/**
 * @param {string|null|undefined} href
 * @returns {boolean}
 */
export function isEvidenceAnchorHref(href) {
  const raw = String(href ?? '').trim();
  return raw.startsWith('#evidence-');
}

/**
 * Parse component id + ref slug from `#evidence-{comp}-{refSlug}`.
 * @param {string|null|undefined} href
 * @returns {{ componentId: string, refSlug: string }|null}
 */
export function parseEvidenceAnchorHref(href) {
  const raw = String(href ?? '').trim();
  if (!raw.startsWith('#evidence-')) return null;
  const body = raw.slice('#evidence-'.length);
  const dash = body.indexOf('-');
  if (dash <= 0) return { componentId: body, refSlug: '' };
  return {
    componentId: body.slice(0, dash),
    refSlug: body.slice(dash + 1),
  };
}
