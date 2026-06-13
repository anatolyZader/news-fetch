/**
 * Cross-component OOV coverage checks after synthesizer.
 */

function claimHasOovFlag(claim) {
  const flags = claim.epistemic_flags ?? claim.flags ?? [];
  return flags.includes('oov_cluster') || flags.includes('unverified');
}

function claimHasOpenObservationFlag(claim) {
  const flags = claim.epistemic_flags ?? claim.flags ?? [];
  return flags.includes('open_observation') || flags.includes('residual_observation');
}

/**
 * @param {object[]} componentAssessments
 * @returns {object[]}
 */
export function collectOovClaimsFromAssessments(componentAssessments) {
  const out = [];
  for (const comp of componentAssessments ?? []) {
    for (const claim of comp.claims ?? []) {
      if (claimHasOovFlag(claim)) {
        out.push({
          component_id: comp.component_id,
          text: claim.text ?? '',
          claim_id: claim.claim_id ?? null,
        });
      }
    }
  }
  return out;
}

/**
 * @param {string} synthesis
 * @param {object} cluster
 * @returns {boolean}
 */
function clusterMentionedInSynthesis(synthesis, cluster) {
  const blob = String(synthesis ?? '').toLowerCase();
  if (!blob) return false;
  const keywords = cluster.keywords ?? [];
  for (const kw of keywords) {
    if (kw && blob.includes(String(kw).toLowerCase())) return true;
  }
  const sample = cluster.sample_evidence ?? cluster.sample ?? '';
  if (sample && blob.includes(String(sample).slice(0, 40).toLowerCase())) return true;
  const key = cluster.cluster_key ?? cluster.key ?? '';
  if (key && blob.includes(String(key).toLowerCase())) return true;
  return false;
}

/**
 * @param {object} synthResult
 * @param {{ oovClusters?: object[], componentAssessments?: object[] }} ctx
 * @returns {object}
 */
export function applySynthesisOovChecks(synthResult, ctx = {}) {
  let result = applyOovClusterChecks(synthResult, ctx);
  result = applyOpenObservationChecks(result, ctx);
  return result;
}

function applyOovClusterChecks(synthResult, ctx = {}) {
  const oovClusters = ctx.oovClusters ?? [];
  if (!oovClusters.length) return synthResult;

  let synthesis = String(synthResult.cross_component_synthesis ?? '');
  const attention_items = [...(synthResult.attention_items ?? [])];
  const seenAttention = new Set(attention_items.map((a) => a.id));

  for (const cluster of oovClusters) {
    const clusterKey = cluster.cluster_key ?? cluster.key ?? 'unknown';
    const alreadyInAttention = attention_items.some((a) =>
      a.id === `oov:burst` || a.id === `oov:unaddressed:${clusterKey}`);
    if (alreadyInAttention || clusterMentionedInSynthesis(synthesis, cluster)) continue;

    const sample = String(cluster.sample_evidence ?? cluster.keywords?.join(', ') ?? clusterKey).slice(0, 200);
    const bullet = `- Unverified repeated phrasing: ${sample}`;
    synthesis = synthesis.trim() ? `${synthesis.trim()}\n${bullet}` : bullet;

    const attId = `oov:unaddressed:${clusterKey}`;
    if (!seenAttention.has(attId)) {
      seenAttention.add(attId);
      attention_items.push({
        id: attId,
        level: 'warning',
        code: 'oov_unaddressed',
        title_key: 'attention.oov.unaddressed',
        detail_key: 'attention.oov.unaddressedDetail',
        detail_params: { sample, count: cluster.count ?? 0 },
        suggested_action_key: 'attention.suggested.reviewEvidence',
      });
    }
  }

  return {
    ...synthResult,
    cross_component_synthesis: synthesis,
    attention_items,
  };
}

function openClaimMentionedInSynthesis(synthesis, claim) {
  const blob = String(synthesis ?? '').toLowerCase();
  if (!blob) return false;
  const text = String(claim.text ?? '').slice(0, 40).toLowerCase();
  if (text.length >= 8 && blob.includes(text.slice(0, 20))) return true;
  const obsId = claim.observation_id ?? claim.claim_id ?? '';
  return obsId && blob.includes(String(obsId).toLowerCase());
}

function applyOpenObservationChecks(synthResult, ctx = {}) {
  const openObservationClaims = ctx.openObservationClaims ?? collectOpenObservationClaimsFromAssessments(ctx.componentAssessments);
  if (!openObservationClaims.length) return synthResult;

  let synthesis = String(synthResult.cross_component_synthesis ?? '');
  const attention_items = [...(synthResult.attention_items ?? [])];
  const seenAttention = new Set(attention_items.map((a) => a.id));

  for (const claim of openObservationClaims) {
    const claimKey = claim.claim_id ?? claim.observation_id ?? claim.text?.slice(0, 30) ?? 'unknown';
    if (openClaimMentionedInSynthesis(synthesis, claim)) continue;

    const sample = String(claim.text ?? '').slice(0, 200);
    const bullet = `- Unverified open observation (${claim.component_id}): ${sample}`;
    synthesis = synthesis.trim() ? `${synthesis.trim()}\n${bullet}` : bullet;

    const attId = `open:unaddressed:${claimKey}`;
    if (!seenAttention.has(attId)) {
      seenAttention.add(attId);
      attention_items.push({
        id: attId,
        level: 'warning',
        code: 'open_observation_unaddressed',
        title_key: 'attention.openObservation.unaddressed',
        detail_key: 'attention.openObservation.unaddressedDetail',
        detail_params: { sample, component_id: claim.component_id },
        suggested_action_key: 'attention.suggested.reviewEvidence',
      });
    }
  }

  return {
    ...synthResult,
    cross_component_synthesis: synthesis,
    attention_items,
  };
}

function collectOpenObservationClaimsFromAssessments(componentAssessments) {
  const out = [];
  for (const comp of componentAssessments ?? []) {
    for (const claim of comp.claims ?? []) {
      if (claimHasOpenObservationFlag(claim)) {
        out.push({
          component_id: comp.component_id,
          claim_id: claim.claim_id,
          text: claim.text ?? '',
          observation_id: claim.observation_id ?? null,
        });
      }
    }
  }
  return out;
}

/**
 * Component-level: narrative ignores own OOV claims.
 * @param {object} assessment
 * @returns {{ issues: object[], requiresRepair: boolean }}
 */
export function checkComponentOovInNarrative(assessment) {
  const issues = [];
  const narrative = String(assessment.narrative ?? '').toLowerCase();
  for (const [i, claim] of (assessment.claims ?? []).entries()) {
    if (!claimHasOovFlag(claim)) continue;
    const snippet = String(claim.text ?? '').slice(0, 40).toLowerCase();
    if (snippet.length >= 8 && !narrative.includes(snippet.slice(0, 20))) {
      issues.push({ type: 'oov_unaddressed_in_narrative', index: i, claim_id: claim.claim_id });
    }
  }
  return { issues, requiresRepair: issues.length > 0 };
}

/**
 * @param {object} assessment
 * @param {object[]} issues
 * @returns {object}
 */
export function repairComponentOovInNarrative(assessment, issues) {
  const oovNotes = issues
    .filter((i) => i.type === 'oov_unaddressed_in_narrative')
    .map((i) => {
      const claim = assessment.claims?.[i.index];
      return claim?.text ? `Unverified pattern: ${String(claim.text).slice(0, 120)}` : null;
    })
    .filter(Boolean);
  if (!oovNotes.length) return assessment;
  const suffix = `\n\n${oovNotes.join(' ')}`;
  return {
    ...assessment,
    narrative: `${assessment.narrative ?? ''}${suffix}`.trim(),
  };
}
