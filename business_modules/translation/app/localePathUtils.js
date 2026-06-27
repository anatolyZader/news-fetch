import { detectSourceLang, normalizeSourceLang } from './detectSourceLang.js';

/**
 * @param {unknown} root
 * @param {string} pathPattern e.g. "articles[].title"
 * @returns {Array<{ path: string, value: string }>}
 */
export function collectStringFields(root, pathPattern) {
  const results = [];
  if (!root || !pathPattern) return results;
  const segments = pathPattern.split('.').filter(Boolean);
  walkCollect(root, segments, 0, '', results);
  return results;
}

/**
 * @param {unknown} val
 * @param {string} path
 * @param {Array<{ path: string, value: string }>} out
 */
function pushStringField(val, path, out) {
  if (typeof val === 'string' && val.trim()) out.push({ path, value: val });
}

/**
 * @param {unknown[]} arr
 * @param {string[]} segments
 * @param {number} idx
 * @param {string} nextPrefix
 * @param {Array<{ path: string, value: string }>} out
 */
function walkArraySegment(arr, segments, idx, nextPrefix, out) {
  const isLeaf = idx === segments.length - 1;
  for (let i = 0; i < arr.length; i++) {
    const itemPath = `${nextPrefix}.${i}`;
    if (isLeaf) pushStringField(arr[i], itemPath, out);
    else walkCollect(arr[i], segments, idx + 1, itemPath, out);
  }
}

/**
 * @param {unknown} node
 * @param {string[]} segments
 * @param {number} idx
 * @param {string} prefix
 * @param {Array<{ path: string, value: string }>} out
 */
function walkCollect(node, segments, idx, prefix, out) {
  if (idx >= segments.length || node == null) return;
  const seg = segments[idx];
  const isArray = seg.endsWith('[]');
  const key = isArray ? seg.slice(0, -2) : seg;
  const nextPrefix = prefix ? `${prefix}.${key}` : key;

  if (isArray) {
    const arr = node[key];
    if (!Array.isArray(arr)) return;
    walkArraySegment(arr, segments, idx, nextPrefix, out);
    return;
  }

  if (idx === segments.length - 1) {
    pushStringField(node[key], nextPrefix, out);
    return;
  }

  const next = node[key];
  if (next && typeof next === 'object') walkCollect(next, segments, idx + 1, nextPrefix, out);
}

/**
 * @param {object} root
 * @param {string} path e.g. "articles.0.title"
 * @returns {unknown}
 */
export function getAtPath(root, path) {
  const parts = path.split('.');
  let cur = root;
  for (const part of parts) {
    if (cur == null) return undefined;
    cur = cur[part];
  }
  return cur;
}

/**
 * @param {object} root
 * @param {string} path
 * @param {unknown} value
 */
export function setAtPath(root, path, value) {
  const parts = path.split('.');
  let cur = root;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (cur[p] == null || typeof cur[p] !== 'object') cur[p] = {};
    cur = cur[p];
  }
  cur[parts.at(-1)] = value;
}

/**
 * @param {string} pathPattern
 */
export function originalFieldName(pathPattern) {
  const leaf = pathPattern.split('.').pop()?.replace('[]', '') ?? 'value';
  return `${leaf}Original`;
}

/**
 * @param {object} root
 * @param {string} path e.g. "articles.0.title"
 * @returns {'en' | 'he' | 'ru'}
 */
function resolveEntrySourceLang(root, path) {
  const parts = path.split('.');
  if (parts.length >= 2) {
    const parentPath = parts.slice(0, -1).join('.');
    const parent = getAtPath(root, parentPath);
    if (parent && typeof parent === 'object' && parent.sourceLang) {
      return normalizeSourceLang(parent.sourceLang);
    }
    if (parent && typeof parent === 'object') {
      const combined = [parent.title, parent.body, parent.notes, parent.content, parent.markdown]
        .filter((v) => typeof v === 'string' && v.trim())
        .join(' ');
      if (combined) return detectSourceLang(combined);
    }
  }
  const leaf = getAtPath(root, path);
  if (typeof leaf === 'string') return detectSourceLang(leaf);
  return 'en';
}

/**
 * @param {object} root
 * @param {import('./localeSchemas.js').LocaleSchema} schema
 */
export function extractForTranslation(root, schema) {
  const entries = [];
  const pathMeta = [];

  for (const field of schema.fields) {
    const hits = collectStringFields(root, field.path);
    for (const hit of hits) {
      const id = `f${entries.length}`;
      entries.push({
        id,
        text: hit.value,
        sourceLang: resolveEntrySourceLang(root, hit.path),
      });
      pathMeta.push({
        path: hit.path,
        originalKey: field.originalKey ?? originalFieldName(field.path),
      });
    }
  }

  return { entries, pathMeta };
}

/**
 * @param {object} root
 * @param {Array<{ id: string, text: string }>} entries
 * @param {Array<{ path: string, originalKey: string }>} pathMeta
 * @param {Record<string, string>} translatedById
 */
export function applyTranslations(root, entries, pathMeta, translatedById) {
  const clone = structuredClone(root);
  entries.forEach((entry, i) => {
    const meta = pathMeta[i];
    const translated = translatedById[entry.id];
    if (!meta || !translated) return;
    const parts = meta.path.split('.');
    const leaf = parts.pop();
    if (!leaf) return;
    let parent = clone;
    for (const p of parts) {
      parent = parent[p];
      if (!parent) return;
    }
    const current = parent[leaf];
    if (typeof current !== 'string') return;
    if (meta.originalKey && parent[meta.originalKey] == null) {
      parent[meta.originalKey] = current;
    }
    parent[leaf] = translated;
  });
  return clone;
}
