import { normalizeLocalityLookupKey } from '../../business_modules/geo/domain/services/resolveLocalityMatch.js';
import { GEO_PROVENANCE, TEXT_INFERENCE_SOURCE_TYPES } from '../../business_modules/geo/domain/value_objects/geoProvenance.js';

const ENGLISH_LOCALITY_WORD = String.raw`[A-Za-z][A-Za-z\-'.]{0,24}`;
const ENGLISH_LOCALITY_PHRASE = String.raw`${ENGLISH_LOCALITY_WORD}(?:\s+${ENGLISH_LOCALITY_WORD}){0,3}`;
const HEBREW_LOCALITY_CHARS = String.raw`א-ת"׳' `;
const HEBREW_LOCALITY_RE = new RegExp(
  String.raw`(?:\bביישוב\b|\bבקיבוץ\b|\bבמושב\b|\bבעיר\b|\bבכפר\b|\bבקריית\b|\bב)\s*([${HEBREW_LOCALITY_CHARS}-]{2,28})`,
);
const HEBREW_BET_RE = new RegExp(String.raw`\bב([${HEBREW_LOCALITY_CHARS}-]{2,28})`);
const BRACKET_LOCALITY_RE = /\[([^\]]{2,40})\]/;
const ARTICLE_SOURCE_LOCALITY_RE = /^(?:pbo|naftali)-(.+)$/i;

const DISCOURSE_PATTERNS = [
  /\b(?:analysts?|pundits?|commentators?)\b/i,
  /\b(?:studio|debate|discussed|discussion)\b/i,
  /\b(?:according to|reported from)\b/i,
  /(?:לדון|דנו|דיון|באולפן|לפי\s+ה)/,
  /(?:אנליסט|פרשנ|באולפן|דיון)/,
];

const HEBREW_LOCATIVE_NEAR = new RegExp(
  String.raw`(?:תושבי|תושב|ביישוב|בקיבוץ|במושב|בעיר|בכפר|בקריית|ב[-\s])`,
);

/**
 * @param {string} s
 * @returns {string}
 */
function escapeRegExp(s) {
  return String(s).replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * @param {string} hay normalized haystack
 * @param {string} normalizedName normalized reference name
 * @returns {boolean}
 */
export function containsReferenceNameAsToken(hay, normalizedName) {
  if (!hay || !normalizedName || normalizedName.length < 3) return false;
  const re = new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(normalizedName)}(?:$|[^\\p{L}\\p{N}])`, 'u');
  return re.test(hay);
}

/**
 * @param {string|null|undefined} evidence
 * @param {string} displayName
 * @returns {boolean}
 */
export function isDiscourseOnlyMention(evidence, displayName) {
  const t = String(evidence ?? '');
  if (!t.trim() || !displayName.trim()) return false;
  const hay = normalizeLocalityLookupKey(t);
  const nameKey = normalizeLocalityLookupKey(displayName);
  if (!containsReferenceNameAsToken(hay, nameKey)) return false;
  const hasDiscourse = DISCOURSE_PATTERNS.some((re) => re.test(t));
  if (!hasDiscourse) return false;
  return !hasLocativeContext(t, displayName);
}

/**
 * @param {string|null|undefined} evidence
 * @param {string} displayName
 * @returns {boolean}
 */
export function hasLocativeContext(evidence, displayName) {
  const t = String(evidence ?? '');
  if (!t.trim()) return false;
  const name = String(displayName ?? '').trim();
  if (!name) return false;
  const hasDiscourse = DISCOURSE_PATTERNS.some((re) => re.test(t));

  if (HEBREW_LOCATIVE_NEAR.test(t) && t.includes(name)) return true;

  const strongEnglishPatterns = [
    new RegExp(String.raw`\b(?:residents|people|citizens)\s+(?:of|in)\s+${escapeRegExp(name)}\b`, 'i'),
    new RegExp(String.raw`\b(?:alert|alerts)\s+(?:sounded|activated)\s+in\s+${escapeRegExp(name)}\b`, 'i'),
    new RegExp(String.raw`\b${escapeRegExp(name)}\s+municipality\b`, 'i'),
    new RegExp(String.raw`\bmunicipality\s+of\s+${escapeRegExp(name)}\b`, 'i'),
  ];
  if (strongEnglishPatterns.some((re) => re.test(t))) return true;

  if (!hasDiscourse) {
    const weakPatterns = [
      new RegExp(String.raw`\bin\s+${escapeRegExp(name)}\s+(?:residents|hospital|beach|area|shelters?)\b`, 'i'),
    ];
    if (weakPatterns.some((re) => re.test(t))) return true;
  }

  return false;
}

/**
 * @param {string|null|undefined} name
 * @returns {boolean}
 */
function isPlausibleLocalityPhrase(name) {
  const n = normalizeLocalityName(name);
  if (!n || n.length < 2) return false;
  const words = n.split(/\s+/);
  if (words.length > 4) return false;
  if (/\b(discussed|discussion|analysts|analyst|studio|debate|reported from)\b/i.test(n)) return false;
  return true;
}

/**
 * @param {string|null|undefined} evidence
 * @param {string|null|undefined} candidate
 * @returns {string|null}
 */
function stripTrailingLocativeNoise(name) {
  const cleaned = String(name ?? '')
    .replace(/\b(entered|shelters|after|during|amid|reported|said|alerts?)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return normalizeLocalityName(cleaned);
}

function acceptTextInferredCandidate(evidence, candidate) {
  const cand = stripTrailingLocativeNoise(candidate);
  if (!cand || !isPlausibleLocalityPhrase(cand)) return null;
  if (isDiscourseOnlyMention(evidence, cand)) return null;
  return cand;
}

/**
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizeLocalityName(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  return s
    .replaceAll(/[()[\]{}<>]/g, ' ')
    .replaceAll(/\s+/g, ' ')
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
    new RegExp(String.raw`\b(${ENGLISH_LOCALITY_PHRASE})\s+municipality\b`, 'i'),
    new RegExp(String.raw`\bmunicipality\s+of\s+(${ENGLISH_LOCALITY_PHRASE})\b`, 'i'),
    new RegExp(String.raw`\b(?:residents|people|citizens)\s+(?:of|in)\s+(${ENGLISH_LOCALITY_PHRASE})\b`, 'i'),
    new RegExp(String.raw`\bin\s+(${ENGLISH_LOCALITY_PHRASE})\s+(?:residents|hospital|beach|area|shelters?)\b`, 'i'),
    new RegExp(String.raw`\b(?:alert|alerts)\s+(?:sounded|activated)\s+in\s+(${ENGLISH_LOCALITY_PHRASE})\b`, 'i'),
  ];
  for (const re of patterns) {
    const m = re.exec(t);
    if (m?.[1]) {
      const cand = acceptTextInferredCandidate(t, m[1]);
      if (cand && cand.length >= 3) return cand;
    }
  }
  return null;
}

/**
 * @param {string|null|undefined} evidence
 * @param {{ entries: { normalized: string, display: string }[] }} nameIndex
 * @param {{ requireLocativeContext?: boolean }} [opts]
 * @returns {string|null}
 */
export function matchLongestReferenceNameInText(evidence, nameIndex, opts = {}) {
  const hay = normalizeLocalityLookupKey(evidence ?? '');
  if (!hay || hay.length < 3) return null;
  let best = null;
  for (const { normalized, display } of nameIndex.entries ?? []) {
    if (normalized.length < 3) continue;
    if (!containsReferenceNameAsToken(hay, normalized)) continue;
    if (isDiscourseOnlyMention(evidence, display)) continue;
    if (opts.requireLocativeContext && !hasLocativeContext(evidence, display)) continue;
    if (!best || normalized.length > best.normalized.length) {
      best = { normalized, display };
    }
  }
  return best?.display ?? null;
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
 * @returns {{ candidate: string|null, scope: 'signal' | 'message', provenance: string|null }}
 */
export function inferLocalityCandidateForSignal(signal, opts = {}) {
  const sourceType = String(signal?.source_type ?? '').trim().toLowerCase();
  const requireLocativeForText = TEXT_INFERENCE_SOURCE_TYPES.has(sourceType);

  const fromField =
    normalizeLocalityName(signal?.locality) ?? normalizeLocalityName(signal?.municipality);
  if (fromField) {
    return { candidate: fromField, scope: 'signal', provenance: GEO_PROVENANCE.structured };
  }

  const fromArticleSource = extractLocalityFromArticleSource(signal?.article_source);
  if (fromArticleSource) {
    return { candidate: fromArticleSource, scope: 'signal', provenance: GEO_PROVENANCE.structured };
  }

  const fromTitle =
    parseFieldReportTitleLocality(signal?.article_title) ??
    parseFieldReportTitleLocality(signal?.articleTitle);
  if (fromTitle) {
    return { candidate: fromTitle, scope: 'signal', provenance: GEO_PROVENANCE.structured };
  }

  const evidence = signal?.evidence ?? '';
  const bracketed = extractBracketedLocality(evidence);
  if (bracketed) {
    return { candidate: bracketed, scope: 'signal', provenance: GEO_PROVENANCE.structured };
  }

  const english = extractEnglishMunicipalityPhrase(evidence);
  if (english) {
    return { candidate: english, scope: 'signal', provenance: GEO_PROVENANCE.text_inferred };
  }

  const hebrewRaw = inferLocalityFromText(evidence);
  const hebrew = acceptTextInferredCandidate(evidence, hebrewRaw);
  if (hebrew) {
    return { candidate: hebrew, scope: 'signal', provenance: GEO_PROVENANCE.text_inferred };
  }

  if (opts.nameIndex) {
    const ref = matchLongestReferenceNameInText(evidence, opts.nameIndex, {
      requireLocativeContext: requireLocativeForText,
    });
    const accepted = acceptTextInferredCandidate(evidence, ref);
    if (accepted) {
      return { candidate: accepted, scope: 'signal', provenance: GEO_PROVENANCE.text_inferred };
    }
  }

  return { candidate: null, scope: 'signal', provenance: null };
}
