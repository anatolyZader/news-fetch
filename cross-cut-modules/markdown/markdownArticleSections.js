/**
 * Shared helpers for parsing numbered markdown article sections
 * (homefront + radio/audio ingest formats).
 */

const HEADER_DATE_RE = /\((\d{4}-\d{2}-\d{2})\)/;
const SECTION_SPLIT_RE = /\n(?=## \d+\. )/;
const TITLE_RE = /^## \d+\.\s+(.+)/m;
const URL_RE = /\*\*URL:\*\*\s*(.+)/;
const PUBLISHED_RE = /\*\*Published:\*\*\s*([^\n]+)/;
const SOURCE_RE = /\*\*Source:\*\*\s*([^\n]+)/;

/** @param {RegExp} re @param {string} text @returns {string|null} */
export function execFirstGroup(re, text) {
  const m = re.exec(text);
  return m?.[1] ?? null;
}

/** @param {string} content */
export function parseHeaderDate(content) {
  return execFirstGroup(HEADER_DATE_RE, content);
}

/** @param {string} content */
export function splitNumberedSections(content) {
  return content.split(SECTION_SPLIT_RE);
}

/**
 * @param {string} section
 * @param {{ urlRe?: RegExp }} [opts]
 */
export function parseSectionMeta(section, opts = {}) {
  const titleMatch = TITLE_RE.exec(section);
  if (!titleMatch) return null;

  const urlRe = opts.urlRe ?? URL_RE;
  const url = execFirstGroup(urlRe, section)?.trim() ?? '';
  const publishedAt = execFirstGroup(PUBLISHED_RE, section)?.trim() ?? '';
  const source = execFirstGroup(SOURCE_RE, section)?.trim() ?? '';

  const metaEnd = section.lastIndexOf('\n- **');
  const afterMeta = metaEnd >= 0 ? section.slice(metaEnd) : section;
  const bodyStart = afterMeta.indexOf('\n\n');
  let body = bodyStart >= 0 ? afterMeta.slice(bodyStart).trim() : '';
  body = body.replace(/\n---\s*$/, '').trim();

  return {
    title: titleMatch[1].trim(),
    url,
    publishedAt,
    source,
    body,
  };
}
