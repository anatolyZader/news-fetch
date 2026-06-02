import { resolve } from 'node:path';
import { createEvidenceDraftStore } from '../db/persistence/evidenceDraftStore.js';
import { createLlmDailyQuotaStore } from '../db/persistence/llmDailyQuotaStore.js';
import { createEvidenceStore } from '../db/persistence/evidenceStore.js';
import { createSourceArchive } from '../db/source_archive/createSourceArchive.js';
import { createRetrievalService } from '../cross-cut-modules/retrieval/index.js';
import { createChatStore } from '../business_modules/chat/infrastructure/chatStore.js';
import { createChatPendingActionStore } from '../business_modules/chat/infrastructure/chatPendingActionStore.js';
import { createVectorIndexStore } from '../cross-cut-modules/vector_index/index.js';
import { createMailingPreferencesStore } from '../business_modules/mailing/infrastructure/mailingPreferencesStore.js';
import { setTranslationRetrievalService } from '../business_modules/translation/app/translationTermRag.js';
import { createOutboxStore } from '../db/persistence/outboxStore.js';
import { createProcessedEventStore } from '../db/persistence/processedEventStore.js';

/**
 * @param {{ repoRoot: string, sqlitePath?: string, articleTimezone?: string }} opts
 */
export function registerPersistence(opts) {
  const sqlitePath = opts.sqlitePath?.trim()
    ? resolve(opts.sqlitePath.trim())
    : resolve(opts.repoRoot, 'db', 'app.sqlite');
  const articleTimezone = opts.articleTimezone || 'Asia/Jerusalem';

  const evidenceDraftStore = createEvidenceDraftStore(sqlitePath);
  const llmDailyQuotaStore = createLlmDailyQuotaStore(sqlitePath);
  const evidenceStore = createEvidenceStore(sqlitePath);
  const retrievalService = createRetrievalService({
    dbPath: sqlitePath,
    timezone: articleTimezone,
    tracePort: opts.tracePort ?? null,
    metricsPort: opts.metricsPort ?? null,
    onUsage: opts.onUsage ?? null,
  });
  setTranslationRetrievalService(retrievalService);

  const sourceArchive = createSourceArchive(sqlitePath, {
    retrievalIndexer: retrievalService,
  });
  const chatStore = createChatStore(sqlitePath);
  const chatPendingActionStore = createChatPendingActionStore(sqlitePath);
  const vectorIndexStore = createVectorIndexStore(sqlitePath);
  const mailingPrefsStore = createMailingPreferencesStore(sqlitePath);
  const outboxStore = createOutboxStore(sqlitePath);
  const processedEventStore = createProcessedEventStore(sqlitePath);

  return {
    sqlitePath,
    articleTimezone,
    evidenceDraftStore,
    llmDailyQuotaStore,
    evidenceStore,
    retrievalService,
    sourceArchive,
    chatStore,
    chatPendingActionStore,
    vectorIndexStore,
    mailingPrefsStore,
    outboxStore,
    processedEventStore,
  };
}
