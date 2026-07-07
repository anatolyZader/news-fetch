import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bootstrapDefaultStateStore } from '../../cross-cut-modules/persistence/bootstrapStateStore.js';
import { resetUserAccessCache } from '../../cross-cut-modules/auth/userAccess.js';
import { resetDefaultResilienceLlmPortForTests } from '../../business_modules/resilience_scorer/app/resilienceLlmCapability.js';
import { resetDefaultEventBusForTests } from '../../cross-cut-modules/messaging/index.js';
import { resetTranslationRetrievalForTests } from '../../business_modules/translation/app/translationTermRag.js';

/**
 * @returns {{ sqlitePath: string, cleanup: () => void, resetSingletons: () => void }}
 */
export function createTestHarness() {
  const dir = mkdtempSync(join(tmpdir(), 'news-test-'));
  const sqlitePath = join(dir, 'test.sqlite');
  process.env.SQLITE_PATH = sqlitePath;
  bootstrapDefaultStateStore();

  return {
    sqlitePath,
    resetSingletons() {
      resetUserAccessCache();
      resetDefaultResilienceLlmPortForTests();
      resetDefaultEventBusForTests();
      resetTranslationRetrievalForTests();
    },
    cleanup() {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    },
  };
}
