/**
 * Single source of truth for translation glossary loading.
 *
 * Base glossary: business_modules/translation/glossary/resilience-translation-glossary.json
 * (maintained in-repo).
 * Manual overrides: business_modules/translation/glossary/translation-glossary-overrides.json
 * (operator-edited) —
 * merged over the base by `id`, so hand-tuned translations survive future
 * automated glossary expansions.
 *
 * Override entry semantics:
 * - existing id → fields present in the override replace the base fields
 *   (e.g. override just `ru` without repeating `aliases`)
 * - existing id + `"remove": true` → term is dropped entirely
 * - new id → added as a new term; must carry `en`, `he`, and `ru`
 *   (skipped with a warning otherwise)
 */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const GLOSSARY_DIR = resolve(REPO_ROOT, 'business_modules', 'translation', 'glossary');

export const TRANSLATION_GLOSSARY_PATH = resolve(GLOSSARY_DIR, 'resilience-translation-glossary.json');
export const TRANSLATION_GLOSSARY_OVERRIDES_PATH = resolve(GLOSSARY_DIR, 'translation-glossary-overrides.json');

/**
 * @param {Array<{ id: string }>} baseTerms
 * @param {Array<{ id: string, remove?: boolean }>} overrides
 * @returns {{ terms: Array<object>, warnings: string[] }}
 */
export function mergeGlossaryOverrides(baseTerms, overrides) {
  const warnings = [];
  const byId = new Map(baseTerms.map((t) => [t.id, { ...t }]));
  const order = baseTerms.map((t) => t.id);

  for (const ov of overrides) {
    if (!ov || typeof ov.id !== 'string' || !ov.id) {
      warnings.push('glossary override without an "id" skipped');
      continue;
    }
    const { remove, ...fields } = ov;
    if (byId.has(ov.id)) {
      if (remove === true) {
        byId.delete(ov.id);
        continue;
      }
      byId.set(ov.id, { ...byId.get(ov.id), ...fields });
      continue;
    }
    if (remove === true) {
      warnings.push(`glossary override "${ov.id}": remove requested but no such base term`);
      continue;
    }
    if (!fields.en || !fields.he || !fields.ru) {
      warnings.push(`glossary override "${ov.id}": new term must have en, he, and ru — skipped`);
      continue;
    }
    byId.set(ov.id, fields);
    order.push(ov.id);
  }

  return { terms: order.filter((id) => byId.has(id)).map((id) => byId.get(id)), warnings };
}

async function readJsonArray(path, { optional }) {
  let raw;
  try {
    raw = await readFile(path, 'utf8');
  } catch (err) {
    if (optional && err?.code === 'ENOENT') return [];
    throw err;
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${path} must be a JSON array`);
  return parsed;
}

/**
 * @param {{ basePath?: string, overridesPath?: string }} [opts]
 * @returns {Promise<{ terms: Array<{ id: string, en: string, he: string, ru: string, category?: string, aliases?: string[] }>, warnings: string[] }>}
 */
export async function loadMergedGlossaryTerms(opts = {}) {
  const base = await readJsonArray(opts.basePath ?? TRANSLATION_GLOSSARY_PATH, { optional: false });
  const overrides = await readJsonArray(opts.overridesPath ?? TRANSLATION_GLOSSARY_OVERRIDES_PATH, { optional: true });
  return mergeGlossaryOverrides(base, overrides);
}
