/**
 * Human-readable chip label for a citation.
 *
 * Falls back to the tail of the source_id when there is no title — long md:
 * source ids share a common path prefix, so truncating from the front would
 * render every chip identical (e.g. "md:business_modules/news-sites/articles_").
 */
const MAX_LABEL = 40;

export function citationChipLabel(citation) {
  const title = String(citation?.title ?? '').trim();
  if (title) return title.slice(0, MAX_LABEL);
  const id = String(citation?.source_id ?? '');
  const tail = id.slice(id.lastIndexOf('/') + 1) || id;
  return tail.length > MAX_LABEL ? `…${tail.slice(-MAX_LABEL)}` : tail;
}
