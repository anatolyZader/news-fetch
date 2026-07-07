import { applySourceCap } from '../../business_modules/resilience_scorer/domain/epistemic/evidenceCaps.js';
import { scoreFromItems, applySaliencePostScoringPolicy } from './scoringShared.js';

export function buildBootstrapSample(items, n, rng) {
  const sample = new Array(n);
  for (let i = 0; i < n; i++) {
    sample[i] = items[Math.floor(rng() * n)];
  }
  return sample;
}

export function scoreBootstrapSample(sample, componentId, totalArticles, capOpts = {}) {
  const articleSet = new Set();
  const sourceSet = new Set();
  for (const it of sample) {
    const k = it.signal.article_url || (it.signal.article_index ?? null);
    if (k != null) articleSet.add(k);
    if (it.signal.source_type) sourceSet.add(it.signal.source_type);
  }
  const capped = applySourceCap(sample, capOpts);
  return applySaliencePostScoringPolicy(
    scoreFromItems(capped, componentId, totalArticles, articleSet, sourceSet),
    capped,
  );
}

export function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}
