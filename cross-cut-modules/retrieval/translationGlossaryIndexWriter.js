/**
 * Index translation glossary JSON into rag_chunks (namespace=terms).
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const TERMS_INDEX_DATE = '2099-01-01';
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_GLOSSARY_PATH = resolve(REPO_ROOT, 'config', 'resilience-translation-glossary.json');

function formatTermText(entry) {
  const aliases = Array.isArray(entry.aliases) ? entry.aliases.join(', ') : '';
  return [
    `term_id: ${entry.id ?? ''}`,
    `en: ${entry.en ?? ''}`,
    `he: ${entry.he ?? ''}`,
    `ru: ${entry.ru ?? ''}`,
    `aliases: ${aliases}`,
  ].join('\n');
}

/**
 * @param {ReturnType<import('./indexWriter.js').createIndexWriter>} indexWriter
 */
export function createTranslationGlossaryIndexWriter(indexWriter) {
  return {
    async reindexTerms(reindexOpts = {}) {
      const glossaryPath = reindexOpts.glossaryPath ?? DEFAULT_GLOSSARY_PATH;
      const raw = readFileSync(glossaryPath, 'utf8');
      const entries = JSON.parse(raw);
      if (!Array.isArray(entries)) {
        throw new Error('translation glossary must be a JSON array');
      }

      let total = 0;
      for (const entry of entries) {
        const body = formatTermText(entry);
        if (!body.trim() || !entry.id) continue;
        const r = await indexWriter.indexChunksForParent({
          namespace: 'terms',
          parentId: `terms:${entry.id}`,
          date: TERMS_INDEX_DATE,
          body,
          sourceType: 'terms',
          title: entry.en ?? entry.id,
          sourceUrl: null,
          kind: 'translation_term',
          scopeId: 'glossary-v1',
        });
        total += r.chunks;
      }
      return { chunks: total, terms: entries.length };
    },
  };
}

export { TERMS_INDEX_DATE, formatTermText };
