import { normalizeLocalityLookupKey } from '../../business_modules/geo/domain/services/resolveLocalityMatch.js';

const ENGLISH_NAME_CHARS = String.raw`A-Za-z\s'.`;
const ENGLISH_NAME_TAIL = `[${ENGLISH_NAME_CHARS}]{2,40}`;
const HEBREW_LOCALITY_CHARS = String.raw`א-ת"׳' `;
const HEBREW_LOCALITY_RE = new RegExp(
  String.raw`(?:\bביישוב\b|\bבקיבוץ\b|\bבמושב\b|\bבעיר\b|\bבכפר\b|\bבקריית\b|\bב)\s*([${HEBREW_LOCALITY_CHARS}-]{2,28})`,
);
const HEBREW_BET_RE = new RegExp(String.raw`\bב([${HEBREW_LOCALITY_CHARS}-]{2,28})`);
const BRACKET_LOCALITY_RE = /\[([^\]]{2,40})\]/;
const ARTICLE_SOURCE_LOCALITY_RE = /^(?:pbo|naftali)-(.+)$/i;

/**
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizeLocalityName(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  return s
    .replace(/[()[\]{}<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || null;
}

/**
 * @param {string|null|undefined} text
 * @returns {string|null}
 */
export function inferLocalityFromText(text) {
  const t = String(text ?? '').trim();
  if (!t) return null;
  const m = HEBREW_LOCALITY_RE.exec(t) ?? HEBREW_BET_RE.exec(t);
  if (!m) return null;
  const cand = normalizeLocalityName(m[1]);
  if (!cand) return null;
  if (/^(האזור|האזור הזה|הצפון|דרום|מרכז|המרכז|הצפון)$/i.test(cand)) return null;
  return cand;
}

/**
 * @param {string|null|undefined} evidence
 * @returns {string|null}
 */
export function extractBracketedLocality(evidence) {
  const t = String(evidence ?? '');
  const m = BRACKET_LOCALITY_RE.exec(t);
  if (!m) return null;
  return normalizeLocalityName(m[1]);
}

/**
 * @param {string|null|undefined} evidence
 * @returns {string|null}
 */
export function extractEnglishMunicipalityPhrase(evidence) {
  const t = String(evidence ?? '');
  const patterns = [
    new RegExp(String.raw`\b([A-Za-z]${ENGLISH_NAME_TAIL})\s+municipality\b`, 'i'),
    new RegExp(String.raw`\bmunicipality\s+of\s+([A-Za-z]${ENGLISH_NAME_TAIL})\b`, 'i'),
    new RegExp(String.raw`\bin\s+([A-Za-z]${ENGLISH_NAME_TAIL})\s+(?:residents|hospital|beach|area)\b`, 'i'),
    new RegExp(String.raw`\b(?:alert|alerts)\s+(?:sounded|activated)\s+in\s+([A-Za-z]${ENGLISH_NAME_TAIL})\b`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m?.[1]) {
      const cand = normalizeLocalityName(m[1]);
      if (cand && cand.length >= 3) return cand;
    }
  }
  return null;
}

/**
 * @param {string|null|undefined} evidence
 * @param {{ entries: { normalized: string, display: string }[] }} nameIndex
 * @returns {string|null}
 */
export function matchLongestReferenceNameInText(evidence, nameIndex) {
  const hay = normalizeLocalityLookupKey(evidence ?? '');
  if (!hay || hay.length < 3) return null;
  for (const { normalized, display } of nameIndex.entries ?? []) {
    if (normalized.length < 3) continue;
    if (hay.includes(normalized)) return display;
  }
  return null;
}

/**
 * @param {string|null|undefined} articleSource
 * @returns {string|null}
 */
export function extractLocalityFromArticleSource(articleSource) {
  const s = String(articleSource ?? '').trim();
  const m = ARTICLE_SOURCE_LOCALITY_RE.exec(s);
  if (!m?.[1]) return null;
  return normalizeLocalityName(m[1]);
}

/**
 * Field visit titles: "municipality — region (visit)" or "council/locality — region".
 * @param {string|null|undefined} title
 * @returns {string|null}
 */
export function parseFieldReportTitleLocality(title) {
  const raw = String(title ?? '').trim();
  if (!raw) return null;
  const beforeDash = raw.split(/\s+—\s+/)[0]?.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!beforeDash) return null;
  const primary = beforeDash.includes('/') ? beforeDash.split('/')[0].trim() : beforeDash;
  return normalizeLocalityName(primary);
}

/**
 * @param {object} signal
 * @param {{ nameIndex?: { entries: { normalized: string, display: string }[] } }} [opts]
 * @returns {{ candidate: string|null, scope: 'signal' | 'message' }}
 */
export function inferLocalityCandidateForSignal(signal, opts = {}) {
  const fromField =
    normalizeLocalityName(signal?.locality) ?? normalizeLocalityName(signal?.municipality);
  if (fromField) return { candidate: fromField, scope: 'signal' };

  const fromArticleSource = extractLocalityFromArticleSource(signal?.article_source);
  if (fromArticleSource) return { candidate: fromArticleSource, scope: 'signal' };

  const fromTitle =
    parseFieldReportTitleLocality(signal?.article_title) ??
    parseFieldReportTitleLocality(signal?.articleTitle);
  if (fromTitle) return { candidate: fromTitle, scope: 'signal' };

  const evidence = signal?.evidence ?? '';
  const bracketed = extractBracketedLocality(evidence);
  if (bracketed) return { candidate: bracketed, scope: 'signal' };

  const english = extractEnglishMunicipalityPhrase(evidence);
  if (english) return { candidate: english, scope: 'signal' };

  const hebrew = inferLocalityFromText(evidence);
  if (hebrew) return { candidate: hebrew, scope: 'signal' };

  if (opts.nameIndex) {
    const ref = matchLongestReferenceNameInText(evidence, opts.nameIndex);
    if (ref) return { candidate: ref, scope: 'signal' };
  }

  return { candidate: null, scope: 'signal' };
}
