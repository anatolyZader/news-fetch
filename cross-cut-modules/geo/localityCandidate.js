import { normalizeLocalityLookupKey } from '../../business_modules/geo/domain/services/resolveLocalityMatch.js';

/**
 * @param {string|null|undefined} raw
 * @returns {string|null}
 */
export function normalizeLocalityName(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  return s
    .replace(/[()\[\]{}<>]/g, ' ')
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
  const m =
    t.match(/(?:\bביישוב\b|\bבקיבוץ\b|\bבמושב\b|\bבעיר\b|\bבכפר\b|\bבקריית\b|\bב)\s*([א-ת"׳'\- ]{2,28})/) ??
    t.match(/\bב([א-ת"׳'\-]{2,28})/);
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
  const m = t.match(/\[([^\]]{2,40})\]/);
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
    /\b([A-Za-z][A-Za-z\s'.-]{2,40})\s+municipality\b/i,
    /\bmunicipality\s+of\s+([A-Za-z][A-Za-z\s'.-]{2,40})\b/i,
    /\bin\s+([A-Za-z][A-Za-z\s'.-]{2,40})\s+(?:residents|hospital|beach|area)\b/i,
    /\b(?:alert|alerts)\s+(?:sounded|activated)\s+in\s+([A-Za-z][A-Za-z\s'.-]{2,40})\b/i,
  ];
  for (const re of patterns) {
    const m = t.match(re);
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
 * @param {object} signal
 * @param {{ nameIndex?: { entries: { normalized: string, display: string }[] } }} [opts]
 * @returns {{ candidate: string|null, scope: 'signal' | 'message' }}
 */
export function inferLocalityCandidateForSignal(signal, opts = {}) {
  const fromField =
    normalizeLocalityName(signal?.locality) ?? normalizeLocalityName(signal?.municipality);
  if (fromField) return { candidate: fromField, scope: 'signal' };

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
