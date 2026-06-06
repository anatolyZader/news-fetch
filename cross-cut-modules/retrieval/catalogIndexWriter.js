/**
 * Index closed signal catalog entries for taxonomy RAG.
 */
import { SIGNAL_CATALOG, CATALOG_VERSION } from '../resilience-contracts/index.js';
const CATALOG_INDEX_DATE = '2099-01-01';

function formatCatalogEntryText(entry) {
  const lines = [
    `signal_type: ${entry.type}`,
    `label: ${entry.label ?? ''}`,
    `domain: ${entry.domain ?? ''}`,
    `signal_class: ${entry.signal_class ?? ''}`,
    `default_polarity: ${entry.defaultPolarity ?? ''}`,
  ];
  const dis = entry.disambiguation;
  if (dis?.not_confused_with?.length) {
    lines.push(`not_confused_with: ${dis.not_confused_with.join(', ')}`);
  }
  if (dis?.accept_patterns?.length) {
    lines.push(`accept_patterns: ${dis.accept_patterns.join(' | ')}`);
  }
  if (dis?.reject_patterns?.length) {
    lines.push(`reject_patterns: ${dis.reject_patterns.join(' | ')}`);
  }
  if (entry.example_evidence?.length) {
    lines.push(`examples: ${entry.example_evidence.join(' | ')}`);
  }
  return lines.join('\n');
}

/**
 * @param {ReturnType<import('./indexWriter.js').createIndexWriter>} indexWriter
 */
export function createCatalogIndexWriter(indexWriter) {
  return {
    async reindexCatalog() {
      let total = 0;
      for (const entry of SIGNAL_CATALOG) {
        const body = formatCatalogEntryText(entry);
        if (!body.trim()) continue;
        const r = await indexWriter.indexChunksForParent({
          namespace: 'catalog',
          parentId: `catalog:${entry.type}`,
          date: CATALOG_INDEX_DATE,
          body,
          sourceType: 'catalog',
          title: entry.label ?? entry.type,
          sourceUrl: null,
          kind: 'catalog_entry',
          scopeId: CATALOG_VERSION,
        });
        total += r.chunks;
      }
      return { chunks: total, catalog_version: CATALOG_VERSION };
    },
  };
}

export { CATALOG_INDEX_DATE, formatCatalogEntryText };
