/**
 * Story cluster assign + collapse for assess-time dedup.
 */
import { createHash } from 'node:crypto';
import { cosineSim } from '../vector_index/vectorMath.js';
import { embedTexts, embeddingModelId, embeddingsEnabled } from '../vector_index/index.js';
import { createStoryClusterStore } from './storyClusterStore.js';
import { resilienceDedupClusterThreshold } from './ragConfig.js';

function evidenceHash(evidence) {
  return createHash('sha256').update(String(evidence ?? '').trim(), 'utf8').digest('hex').slice(0, 24);
}

function groupKey(s) {
  return `${s.source_type ?? '_unknown'}|${s.signal_type ?? '_'}`;
}

function reliabilityRank(s) {
  const order = {
    direct_quote_named_person: 4,
    named_survey_statistic: 3,
    named_institutional_fact: 2,
    observational_reported_fact: 1,
  };
  return order[s.evidence_type] ?? 0;
}

function signalWeight(s) {
  return (s.temporal_weight ?? 1) + reliabilityRank(s) * 0.01;
}

function newClusterId(sourceType, signalType, hash) {
  return `cluster:${sourceType}:${signalType}:${hash}`;
}

function findBestCluster(clusters, vector, threshold) {
  let bestId = null;
  let bestSim = -1;
  for (const c of clusters) {
    if (!c.vector?.length) continue;
    const sim = cosineSim(vector, c.vector);
    if (sim >= threshold && sim > bestSim) {
      bestSim = sim;
      bestId = c.clusterId;
    }
  }
  return bestId;
}

function assignSignalCluster(s, store, emb, model, threshold) {
  const st = s.source_type ?? '_unknown';
  const sig = s.signal_type ?? '_';
  const ev = String(s.evidence).trim();
  const hash = evidenceHash(ev);
  const clusters = store.listClustersForGroup(st, sig);
  const bestId = findBestCluster(clusters, emb.vector, threshold);

  if (bestId) {
    s.story_cluster_id = bestId;
    store.incrementMember(bestId);
    return;
  }

  const clusterId = newClusterId(st, sig, hash);
  store.upsertCluster({
    clusterId,
    sourceType: st,
    signalType: sig,
    evidenceHash: hash,
    evidencePreview: ev.slice(0, 200),
    vector: emb.vector,
    dim: emb.vector.length,
    embedModel: emb.model ?? model,
    memberCount: 1,
  });
  s.story_cluster_id = clusterId;
}

/**
 * @param {string} dbPath
 */
export function createStoryClusterIndex(dbPath) {
  const store = createStoryClusterStore(dbPath);
  const threshold = resilienceDedupClusterThreshold();

  return {
    close() {
      store.close();
    },

    /**
     * Batch-index signal evidence into persistent clusters.
     * @param {Array<object>} signals
     */
    async upsertSignals(signals) {
      if (!embeddingsEnabled()) return { indexed: 0 };
      const model = embeddingModelId();
      const withEvidence = (signals ?? []).filter((s) => String(s?.evidence ?? '').trim());
      if (!withEvidence.length) return { indexed: 0 };

      const texts = withEvidence.map((s) => String(s.evidence).trim());
      let embeddings = [];
      try {
        embeddings = await embedTexts(texts, { model });
      } catch (err) {
        console.error('storyClusterIndex: embed failed:', err.message);
        return { indexed: 0 };
      }

      let indexed = 0;
      for (let i = 0; i < withEvidence.length; i++) {
        const s = withEvidence[i];
        const emb = embeddings[i];
        if (!emb?.vector?.length) continue;
        assignSignalCluster(s, store, emb, model, threshold);
        indexed++;
      }
      return { indexed };
    },

    /**
     * Assign cluster ids to signals (uses store + embed for unassigned).
     * @param {Array<object>} signals
     */
    async assignClusterIds(signals) {
      await this.upsertSignals(signals);
      return signals;
    },

    /**
     * Collapse signals that share story_cluster_id within (source_type, signal_type).
     * @param {Array<object>} signals
     */
    /**
     * Find nearest story cluster for evidence (cross-group scan within source_type + signal_types).
     * @param {string} evidence
     * @param {{ sourceType?: string, signalTypes?: string[] }} [opts]
     */
    async findNearestCluster(evidence, opts = {}) {
      if (!embeddingsEnabled()) return null;
      const ev = String(evidence ?? '').trim();
      if (!ev) return null;
      const model = embeddingModelId();
      let emb;
      try {
        const rows = await embedTexts([ev], { model });
        emb = rows[0];
      } catch {
        return null;
      }
      if (!emb?.vector?.length) return null;

      const st = opts.sourceType ?? '_unknown';
      const types = opts.signalTypes?.length ? opts.signalTypes : ['_'];
      const threshold = resilienceDedupClusterThreshold();
      let best = null;
      let bestSim = -1;

      for (const sig of types) {
        for (const c of store.listClustersForGroup(st, sig)) {
          if (!c.vector?.length) continue;
          const sim = cosineSim(emb.vector, c.vector);
          if (sim >= threshold && sim > bestSim) {
            bestSim = sim;
            best = {
              cluster_id: c.clusterId,
              similarity: sim,
              evidence_preview: c.evidencePreview,
              member_count: c.memberCount,
              signal_type: c.signalType,
            };
          }
        }
      }
      return best;
    },

    collapseSignals(signals) {
      const byCluster = new Map();
      const noCluster = [];

      for (const s of signals ?? []) {
        const cid = s.story_cluster_id;
        if (!cid) {
          noCluster.push(s);
          continue;
        }
        const key = `${groupKey(s)}|${cid}`;
        const existing = byCluster.get(key);
        if (!existing) {
          byCluster.set(key, { ...s, _semantic_dedup_count: 1 });
          continue;
        }
        existing._semantic_dedup_count = (existing._semantic_dedup_count ?? 1) + 1;
        if (signalWeight(s) > signalWeight(existing)) {
          const count = existing._semantic_dedup_count;
          byCluster.set(key, { ...s, _semantic_dedup_count: count });
        }
      }

      return [...noCluster, ...byCluster.values()];
    },
  };
}
