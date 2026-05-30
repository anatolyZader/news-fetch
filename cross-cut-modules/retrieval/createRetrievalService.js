/**
 * Factory: chunk store + index writer + retrieval orchestrator.
 */
import { createChunkStore } from './chunkStore.js';
import { createIndexWriter } from './indexWriter.js';
import { createRetrievalOrchestrator } from './retrievalService.js';
import { createStoryClusterIndex } from './storyClusterIndex.js';
import { createCatalogIndexWriter } from './catalogIndexWriter.js';
import { createFieldExamplesIndexWriter } from './fieldExamplesIndexWriter.js';
import { createHfcGuidelinesIndexWriter } from './hfcGuidelinesIndexWriter.js';
import { createSocialExamplesIndexWriter } from './socialExamplesIndexWriter.js';
import { createDocsIndexWriter } from './docsIndexWriter.js';
import { createTranslationGlossaryIndexWriter } from './translationGlossaryIndexWriter.js';
import { createRetrievalPortAdapter } from './infrastructure/retrievalPortAdapter.js';

/**
 * @param {{ dbPath: string, timezone?: string }} opts
 */
export function createRetrievalService(opts) {
  const dbPath = String(opts?.dbPath ?? '').trim();
  if (!dbPath) throw new Error('createRetrievalService: dbPath required');

  const chunkStore = createChunkStore(dbPath);
  const indexWriter = createIndexWriter(chunkStore);
  const retrieval = createRetrievalOrchestrator(chunkStore, indexWriter, {
    timezone: opts.timezone,
  });
  const storyClusterIndex = createStoryClusterIndex(dbPath);
  const catalogIndexWriter = createCatalogIndexWriter(indexWriter);
  const fieldExamplesIndexWriter = createFieldExamplesIndexWriter(indexWriter);
  const hfcGuidelinesIndexWriter = createHfcGuidelinesIndexWriter(indexWriter);
  const socialExamplesIndexWriter = createSocialExamplesIndexWriter(indexWriter);
  const docsIndexWriter = createDocsIndexWriter(indexWriter);
  const translationGlossaryIndexWriter = createTranslationGlossaryIndexWriter(indexWriter);

  const port = createRetrievalPortAdapter({
    retrieval,
    indexWriter,
    indexArchiveRow(row) {
      return retrieval.indexArchiveRow(row);
    },
    rebuildFts() {
      retrieval.rebuildFts();
    },
    deleteEphemeralBeforeDate(cutoff, types) {
      return retrieval.deleteEphemeralBeforeDate(cutoff, types);
    },
  });

  return {
    close() {
      storyClusterIndex.close();
      chunkStore.close();
    },
    storyClusterIndex,
    catalogIndexWriter,
    fieldExamplesIndexWriter,
    hfcGuidelinesIndexWriter,
    socialExamplesIndexWriter,
    docsIndexWriter,
    translationGlossaryIndexWriter,
    port,
    chunkStore,
    indexWriter,
    retrieval,
    /** Indexer hook for createSourceArchive */
    indexArchiveRow(row) {
      return retrieval.indexArchiveRow(row);
    },
    deleteEphemeralBeforeDate(cutoff, types) {
      return retrieval.deleteEphemeralBeforeDate(cutoff, types);
    },
    rebuildFts() {
      retrieval.rebuildFts();
    },
  };
}
