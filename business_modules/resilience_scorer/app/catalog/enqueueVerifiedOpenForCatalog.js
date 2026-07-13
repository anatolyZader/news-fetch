/**
 * Enqueue verified open observations for catalog evolution (Phase 3).
 */
import { resolve } from 'node:path';
import { bufferOovCapture } from '../../domain/services/oov/oovCapture.js';
import { isCatalogAutoProposeVerifiedEnabled } from '../../domain/services/oov/openExtractConfig.js';
import { LEARNING_CAPTURE_KINDS } from '../../domain/contracts/learningCaptureKinds.js';

/**
 * @param {Array<object>} verifiedClaims
 * @param {object[]} openObservations
 * @param {object} opts
 */
export async function enqueueVerifiedOpenForCatalog(verifiedClaims, openObservations, opts = {}) {
  if (!verifiedClaims?.length) return { enqueued: 0, proposals_generated: 0 };

  const obsById = new Map(openObservations.map((o) => [String(o.observation_id), o]));
  let enqueued = 0;

  for (const entry of verifiedClaims) {
    const obs = entry.observation ?? obsById.get(String(entry.observation_id));
    if (!obs) continue;

    const comp = (opts.assessment?.components ?? []).find((c) => c.component_id === entry.component_id);

    bufferOovCapture({
      capture_kind: LEARNING_CAPTURE_KINDS.VERIFIED_OPEN_OBSERVATION,
      observation_id: obs.observation_id,
      component_id: entry.component_id,
      claim_id: entry.claim_id,
      evidence: obs.evidence ?? obs.behavioral_description,
      behavioral_description: obs.behavioral_description ?? null,
      suggested_catalog_types: obs.suggested_catalog_types ?? obs.nearest_existing_types ?? [],
      specialist_severity: comp?.severity ?? null,
      corroboration_level: entry.corroboration_level,
      report_scope: opts.reportScopeId ?? 'national',
      report_date: opts.reportDate,
      timestamp: new Date().toISOString(),
    });
    enqueued += 1;
  }

  let proposals_generated = 0;
  if (isCatalogAutoProposeVerifiedEnabled() && enqueued > 0) {
    try {
      const repoRoot = opts.repoRoot ?? process.cwd();
      const sqlitePath = process.env.SQLITE_PATH?.trim() || resolve(repoRoot, 'db', 'app.sqlite');
      const { createCatalogProposalService, createCatalogProposalSqliteStore } = await import(
        '../../../signal_catalog_evolution/index.js'
      );
      const proposalService = createCatalogProposalService({
        proposalStore: createCatalogProposalSqliteStore(sqlitePath),
      });
      const proposalResult = await proposalService.generateProposalsFromVerifiedOpen({
        minRecurrence: 3,
        maxDays: 14,
      });
      proposals_generated = proposalResult.generated ?? 0;
    } catch (err) {
      console.error(`  ⚠ Catalog auto-propose skipped: ${err.message}`);
    }
  }

  return { enqueued, proposals_generated };
}
