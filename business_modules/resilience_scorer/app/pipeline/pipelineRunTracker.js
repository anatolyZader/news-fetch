import { CATALOG_VERSION } from '../../domain/services/signals/routing/signalRouter.js';
import { GEO_POLICY_VERSION } from '../../../../business_modules/geo/index.js';

/**
 * @param {import('../../domain/ports/IPipelineRunStore.js').IPipelineRunStore | null | undefined} store
 * @param {{ reportDate: string, reportScopeId: string }} meta
 */
export function createPipelineRunTracker(store, meta) {
  const runKey = `${meta.reportDate}:${meta.reportScopeId}`;
  if (!store) {
    return {
      startRun() {},
      completeStage() {},
      failStage() {},
    };
  }
  store.startRun({
    runKey,
    reportDate: meta.reportDate,
    reportScopeId: meta.reportScopeId,
  });
  return {
    startRun() {},
    completeStage(stage, extraVersions = {}) {
      store.completeStage(runKey, stage, {
        catalogVersion: CATALOG_VERSION,
        geoPolicyVersion: GEO_POLICY_VERSION,
        ...extraVersions,
      });
    },
    failStage(stage, err) {
      store.failStage(runKey, stage, err?.message ?? String(err));
    },
  };
}
