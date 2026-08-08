/**
 * Index developer corrections into report RAG namespace (institutional memory).
 */
import { createIndexWriter } from '../../../cross-cut-modules/retrieval/indexWriter.js';
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { assessmentEvalDir } from '../domain/services/artifactPaths.js';

/**
 * @param {object} deps
 * @param {ReturnType<import('../../../cross-cut-modules/retrieval/chunkStore.js').createChunkStore>} deps.chunkStore
 */
export function createInstitutionalMemoryService(deps) {
  const indexWriter = createIndexWriter(deps.chunkStore);
  const evalDir = deps.evalDir ?? assessmentEvalDir();
  const evalLogPath = join(evalDir, 'agent-eval-negative.jsonl');

  return {
    async indexDeveloperCorrection({ date, componentId, claimText, rationale, developerEmail }) {
      const body = [
        `Developer correction (${date})`,
        `Component: ${componentId}`,
        `Claim rejected: ${claimText}`,
        `Rationale: ${rationale}`,
        developerEmail ? `By: ${developerEmail}` : '',
      ].filter(Boolean).join('\n');

      await indexWriter.indexChunksForParent({
        namespace: 'report',
        parentId: `correction:${date}:${componentId}:${Date.now()}`,
        date,
        body,
        sourceType: 'developer_correction',
        title: `Correction: ${componentId}`,
        kind: 'developer_correction',
        scopeId: 'national',
      });
      if (deps.rebuildFts) deps.rebuildFts();
      return { indexed: true };
    },

    logUserDismissal({ recommendationId, rationale, date }) {
      mkdirSync(evalDir, { recursive: true });
      appendFileSync(evalLogPath, `${JSON.stringify({
        ts: new Date().toISOString(),
        type: 'user_dismissal',
        recommendation_id: recommendationId,
        rationale,
        date,
      })}\n`);
      return { logged: true };
    },
  };
}
