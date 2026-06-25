/**
 * Municipality name resolution for chat tools (aliases, geo keys, PBO index).
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeLocalityLookupKey } from '../../../business_modules/geo/index.js';
import { buildReferenceNameIndex } from '../../../cross-cut-modules/geo/referenceNameIndex.js';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** @type {{ normalized: string, display: string }[]|null} */
let referenceIndexCache = null;

/** @returns {{ normalized: string, display: string }[]} */
function getReferenceEntries() {
  if (referenceIndexCache) return referenceIndexCache;
  try {
    const { entries } = buildReferenceNameIndex(REPO_ROOT);
    referenceIndexCache = entries;
    return entries;
  } catch {
    referenceIndexCache = [];
    return [];
  }
}

/** normalized alias key → display names to try */
const STATIC_ALIASES = {
  kiryatshmona: ['קריית שמונה', 'Kiryat Shmona'],
  kiryatshmona_typo: ['Kitryat Shmona'],
  tiberias: ['טבריה', 'Tiberias'],
  safed: ['צפת', 'Safed', 'Tsfat'],
  nahariya: ['נהריה', 'Nahariya'],
  acre: ['עכו', 'Acre', 'Akko'],
};

function normKey(s) {
  return normalizeLocalityLookupKey(String(s ?? ''));
}

function findAliasGroupForNorm(inputNorm) {
  for (const aliases of Object.values(STATIC_ALIASES)) {
    for (const alias of aliases) {
      const an = normKey(alias);
      if (!an) continue;
      if (an === inputNorm || inputNorm.includes(an) || an.includes(inputNorm)) {
        return aliases;
      }
    }
  }
  return null;
}

function matchKeyInList(inputNorm, input, keys) {
  for (const key of keys) {
    if (normKey(key) === inputNorm) return key;
    if (key.includes(input) || input.includes(key)) return key;
  }
  return null;
}

function resolveFromAliasGroup(aliasGroup, keys) {
  for (const key of keys) {
    const kn = normKey(key);
    if (aliasGroup.some((a) => normKey(a) === kn || key.includes(a) || a.includes(key))) {
      return key;
    }
  }
  return aliasGroup[0];
}

function resolveFromStaticAliases(inputNorm, keys) {
  for (const aliases of Object.values(STATIC_ALIASES)) {
    for (const alias of aliases) {
      if (normKey(alias) !== inputNorm) continue;
      const hit = keys.find((k) => normKey(k) === normKey(alias) || k.includes(alias) || alias.includes(k));
      return hit ?? alias;
    }
  }
  return null;
}

/**
 * @param {string} raw
 * @param {{ pboLookupKeys?: string[] }} [opts]
 * @returns {string|null} best display name for matching
 */
export function resolveMunicipalityName(raw, opts = {}) {
  const input = String(raw ?? '').trim();
  if (!input) return null;

  const keys = opts.pboLookupKeys ?? [];
  const inputNorm = normKey(input);

  const keyHit = matchKeyInList(inputNorm, input, keys);
  if (keyHit) return keyHit;

  const aliasGroup = findAliasGroupForNorm(inputNorm);
  if (aliasGroup) return resolveFromAliasGroup(aliasGroup, keys);

  const staticHit = resolveFromStaticAliases(inputNorm, keys);
  if (staticHit) return staticHit;

  return input;
}

/**
 * @param {object} signal
 * @param {string} municipalityQuery
 * @returns {boolean}
 */
export function signalMatchesMunicipality(signal, municipalityQuery) {
  const q = normKey(municipalityQuery);
  if (!q) return true;

  const fields = [
    signal.evidence,
    signal.article_source,
    signal.locality,
    signal.municipality,
    signal.geo?.canonicalKey?.replaceAll('_', ' '),
    signal.geo?.matchedName,
  ];
  for (const f of fields) {
    const n = normKey(f);
    if (!n) continue;
    if (n.includes(q) || q.includes(n)) return true;
  }
  return false;
}

/**
 * @param {string} message
 * @param {{ pboLookupKeys?: string[] }} [opts]
 * @returns {string|null}
 */
export function extractMunicipalityFromMessage(message, opts = {}) {
  const text = String(message ?? '');
  if (!text.trim()) return null;

  const keys = opts.pboLookupKeys ?? [];
  const lower = text.toLowerCase();

  for (const key of keys) {
    if (lower.includes(key.toLowerCase()) || text.includes(key)) return key;
  }

  const entries = getReferenceEntries();
  for (const { normalized, display } of entries) {
    if (normalized.length < 4) continue;
    if (lower.includes(normalized) || text.includes(display)) {
      const hit = keys.find((k) => normKey(k) === normalized || k.includes(display));
      return hit ?? display;
    }
  }

  for (const aliases of Object.values(STATIC_ALIASES)) {
    for (const alias of aliases) {
      if (lower.includes(alias.toLowerCase()) || text.includes(alias)) {
        const hit = keys.find((k) => normKey(k) === normKey(alias));
        return hit ?? alias;
      }
    }
  }

  return null;
}

/**
 * Find municipality row in PBO dashboard day.
 * @param {object} day
 * @param {string} municipalityName
 * @returns {object|null}
 */
export function findMunicipalityInDay(day, municipalityName) {
  const resolved = resolveMunicipalityName(municipalityName, {
    pboLookupKeys: (day.municipalities ?? []).map((m) => m.name),
  });
  if (!resolved) return null;
  const rNorm = normKey(resolved);
  return (day.municipalities ?? []).find((m) => {
    const n = normKey(m.name);
    return n === rNorm || m.name.includes(resolved) || resolved.includes(m.name);
  }) ?? null;
}
