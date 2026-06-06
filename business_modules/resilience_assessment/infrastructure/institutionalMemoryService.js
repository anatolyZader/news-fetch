/**
 * Index analyst corrections into report RAG namespace (institutional memory).
 */
import { createIndexWriter } from '../../../cross-cut-modules/retrieval/indexWriter.js';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

/**
 * @param {object} deps
 * @param {ReturnType<import('../../../cross-cut-modules/retrieval/chunkStore.js').createChunkStore>} deps.chunkStore
 */
export function createInstitutionalMemoryService(deps) {
  const indexWriter = createIndexWriter(deps.chunkStore);
  const evalLogPath = join(deps.reportsDir ?? 'daily_reports', 'agent-eval-negative.jsonl');

  return {
    async indexAnalystCorrection({ date, componentId, claimText, rationale, analystEmail }) {
      const body = [
        `Analyst correction (${date})`,
        `Component: ${componentId}`,
        `Claim rejected: ${claimText}`,
        `Rationale: ${rationale}`,
        analystEmail ? `By: ${analystEmail}` : '',
      ].filter(Boolean).join('\n');

      await indexWriter.indexChunksForParent({
        namespace: 'report',
        parentId: `correction:${date}:${componentId}:${Date.now()}`,
        date,
        body,
        sourceType: 'analyst_correction',
        title: `Correction: ${componentId}`,
        kind: 'analyst_correction',
        scopeId: 'national',
      });
      if (deps.rebuildFts) deps.rebuildFts();
      return { indexed: true };
    },

    logOperatorDismissal({ recommendationId, rationale, date }) {
      mkdirSync(deps.reportsDir ?? 'daily_reports', { recursive: true });
      appendFileSync(evalLogPath, `${JSON.stringify({
        ts: new Date().toISOString(),
        type: 'operator_dismissal',
        recommendation_id: recommendationId,
        rationale,
        date,
      })}\n`);
      return { logged: true };
    },
  };
}
