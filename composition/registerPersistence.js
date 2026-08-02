import { resolve } from 'node:path';
import { createEvidenceDraftStore } from '../db/persistence/evidenceDraftStore.js';
import { createLlmDailyQuotaStore } from '../db/persistence/llmDailyQuotaStore.js';
import { createEvidenceStore } from '../db/persistence/evidenceStore.js';
import { createSourceArchive } from '../db/source_archive/createSourceArchive.js';
import { createRetrievalService } from '../cross-cut-modules/retrieval/index.js';
import { createChatStore } from '../business_modules/chat/infrastructure/chatStore.js';
import { createChatPendingActionStore } from '../business_modules/chat/infrastructure/chatPendingActionStore.js';
import { createSignalFlagStore } from '../business_modules/chat/infrastructure/signalFlagStore.js';
import { createVectorIndexStore } from '../cross-cut-modules/vector_index/index.js';
import { createMailingPreferencesStore } from '../business_modules/mailing/infrastructure/mailingPreferencesStore.js';
import { createTourProgressStore } from '../business_modules/product_tour/infrastructure/tourProgressStore.js';
import { setTranslationRetrievalService } from '../business_modules/translation/app/translationTermRag.js';
import { createOutboxStore } from '../db/persistence/outboxStore.js';
import { createProcessedEventStore } from '../db/persistence/processedEventStore.js';
import { createCrisisBudgetSqliteAdapter } from '../cross-cut-modules/budget/infrastructure/adapters/crisisBudgetSqliteAdapter.js';
import { createCrisisBudgetService } from '../cross-cut-modules/budget/app/crisisBudgetService.js';

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
  const signalFlagStore = createSignalFlagStore();
  const vectorIndexStore = createVectorIndexStore(sqlitePath);
  const mailingPrefsStore = createMailingPreferencesStore(sqlitePath);
  const tourProgressStore = createTourProgressStore(sqlitePath);
  const outboxStore = createOutboxStore(sqlitePath);
  const processedEventStore = createProcessedEventStore(sqlitePath);
  const crisisBudgetAdapter = createCrisisBudgetSqliteAdapter({ dbPath: sqlitePath });
  const crisisBudgetService = createCrisisBudgetService({ adapter: crisisBudgetAdapter });

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
    signalFlagStore,
    vectorIndexStore,
    mailingPrefsStore,
    tourProgressStore,
    outboxStore,
    processedEventStore,
    crisisBudgetService,
  };
}
