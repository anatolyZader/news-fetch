/**
 * Buffer verified open observations as learning-capture records (Phase 3).
 */
import { bufferOovCapture } from '../../domain/services/oov/oovCapture.js';
import { LEARNING_CAPTURE_KINDS } from '../../domain/contracts/learningCaptureKinds.js';

/**
 * @param {Array<object>} verifiedClaims
 * @param {object[]} openObservations
 * @param {object} opts
 */
export async function enqueueVerifiedOpenForCatalog(verifiedClaims, openObservations, opts = {}) {
  if (!verifiedClaims?.length) return { enqueued: 0 };

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

  return { enqueued };
}
