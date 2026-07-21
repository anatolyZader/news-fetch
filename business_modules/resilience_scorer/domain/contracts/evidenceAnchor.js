/**
 * Stable DOM anchor ids linking narrative citations to evidence list rows.
 *
 * Pipeline position: report display (server + client) — generates #evidence-*
 * hrefs for in-page citation jumps. Client-safe isomorphic.
 *
 * Owns: encodeRefForAnchor, evidenceAnchorId/Href, parseEvidenceAnchorHref.
 * Does NOT: citation author resolution (citationDisplay.js) or APA formatting.
 *
 * Key collaborators: inlineCitationResolve.js, apaCitationFormat.js,
 * client evidence list components.
 */

/**
 * Slug-encode a signal ref for use in DOM anchor ids.
 * @param {string|null|undefined} ref
 * @returns {string}
 */
export function encodeRefForAnchor(ref) {
  return String(ref ?? '')
    .trim()
    .replace(/^@+/, '')
    .replaceAll('@', '-')
    .replaceAll(/[^a-zA-Z0-9_-]+/g, '-')
    .replaceAll(/-+/g, '-')
    .replaceAll(/^-|-$/g, '')
    .slice(0, 120);
}

/**
 * Build a stable element id for an evidence row: evidence-{comp}-{refSlug}.
 * @param {string|null|undefined} componentId
 * @param {string|null|undefined} ref
 * @returns {string}
 */
export function evidenceAnchorId(componentId, ref) {
  const comp = String(componentId ?? 'component').trim().replaceAll(/[^a-zA-Z0-9_-]+/g, '-');
  const encoded = encodeRefForAnchor(ref);
  if (!encoded) return `evidence-${comp}`;
  return `evidence-${comp}-${encoded}`;
}

/**
 * Build an in-page href targeting an evidence anchor id.
 * @param {string|null|undefined} componentId
 * @param {string|null|undefined} ref
 * @returns {string}
 */
export function evidenceAnchorHref(componentId, ref) {
  return `#${evidenceAnchorId(componentId, ref)}`;
}

/**
 * Return true when href is an evidence anchor link (#evidence-...).
 * @param {string|null|undefined} href
 * @returns {boolean}
 */
export function isEvidenceAnchorHref(href) {
  const raw = String(href ?? '').trim();
  return raw.startsWith('#evidence-');
}

/**
 * Parse component id and ref slug from `#evidence-{comp}-{refSlug}`.
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
