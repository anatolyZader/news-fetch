/**
 * Parse radio/audio markdown exports (audioIngestService.buildAudioMarkdownDocument format).
 */

import {
  execFirstGroup,
  parseHeaderDate,
  parseSectionMeta,
  splitNumberedSections,
} from '../../../../cross-cut-modules/markdown/markdownArticleSections.js';

const RADIO_FILE_RE = /^articles-audio-.+\.md$/i;
const DATE_IN_FILENAME_RE = /(\d{4}-\d{2}-\d{2})(?:T[\d-]+)?\.md$/i;
const SOURCE_FILE_LINE_RE = /^Source file: (.+)$/m;
const SOURCE_LINE_RE = /^Source: (.+)$/m;

/**
 * @param {string} fileName
 * @returns {string|null}
 */
export function parseRadioDateFromFileName(fileName) {
  const m = DATE_IN_FILENAME_RE.exec(fileName);
  return m?.[1] ?? null;
}

/**
 * @param {string} fileName
 * @returns {{ station: string|null, slot: string|null }}
 */
export function parseRadioFileMeta(fileName) {
  const base = fileName.replace(/\.md$/i, '');
  const withoutPrefix = base.replace(/^articles-audio-/i, '');
  const dateMatch = /(\d{4}-\d{2}-\d{2})(?:T([\d-]+))?$/.exec(withoutPrefix);
  if (!dateMatch) return { station: withoutPrefix || null, slot: null };
  const beforeDate = withoutPrefix.slice(0, dateMatch.index).replace(/-$/, '');
  return {
    station: beforeDate || null,
    slot: dateMatch[2] ?? null,
  };
}

function parseSourceFileLine(content) {
  return execFirstGroup(SOURCE_FILE_LINE_RE, content)?.trim()
    ?? execFirstGroup(SOURCE_LINE_RE, content)?.trim()
    ?? null;
}

/**
 * @param {string} content
 * @param {string} sourcePath
 * @returns {{
 *   date: string|null,
 *   intro: string|null,
 *   sourceFileLine: string|null,
 *   segments: Array<{
 *     idx1: number,
 *     title: string,
 *     url: string,
 *     publishedAt: string,
 *     source: string,
 *     station: string|null,
 *     program: string|null,
 *     body: string,
 *     sourceFile: string,
 *   }>,
 * }}
 */
export function parseAudioMarkdown(content, sourcePath) {
  const headerDate = parseHeaderDate(content);
  const intro = content.split('\n').find((line, i) => i >= 2 && line.trim() && !line.startsWith('#'))?.trim() ?? null;
  const sourceFileLine = parseSourceFileLine(content);

  const sections = splitNumberedSections(content);
  const segments = [];
  let idx1 = 0;

  for (const section of sections) {
    const meta = parseSectionMeta(section);
    if (!meta) continue;
    idx1 += 1;

    const sourceLabel = meta.source;
    const [station, program] = sourceLabel.includes(' — ')
      ? sourceLabel.split(' — ').map((s) => s.trim())
      : [sourceLabel, null];

    segments.push({
      idx1,
      title: meta.title,
      url: meta.url,
      publishedAt: meta.publishedAt,
      source: sourceLabel,
      station: station || null,
      program: program || null,
      body: meta.body,
      sourceFile: sourcePath,
    });
  }

  return {
    date: headerDate,
    intro,
    sourceFileLine,
    segments,
  };
}

export { RADIO_FILE_RE };
