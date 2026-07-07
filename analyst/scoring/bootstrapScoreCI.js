import {
  BOOTSTRAP_SAMPLES,
  BOOTSTRAP_SEED,
  createSeededRng,
} from './scoringShared.js';
import {
  buildBootstrapSample,
  percentile,
  scoreBootstrapSample,
} from './bootstrapResample.js';

const CI_UNSTABLE_THRESHOLD = 0.2;

function buildUnstableCi(scores, currentScore) {
  const centre = currentScore == null
    ? scores[Math.floor(scores.length / 2)]
    : currentScore;
  return {
    score_low: Math.max(1, centre - 2),
    score_high: Math.min(10, centre + 2),
    ci_unstable: true,
  };
}

function resampleScoreValues(items, componentId, totalArticles, rng, capOpts) {
  const n = items.length;
  const scores = [];
  let nullSamples = 0;
  for (let r = 0; r < BOOTSTRAP_SAMPLES; r++) {
    const sample = buildBootstrapSample(items, n, rng);
    const sc = scoreBootstrapSample(sample, componentId, totalArticles, capOpts);
    if (sc) scores.push(sc.score);
    else nullSamples += 1;
  }
  return { scores, nullSamples };
}

/**
 * Bootstrap a 90% confidence interval on the score by resampling contribution
 * items with replacement N times.
 */
export function bootstrapScoreCI(items, componentId, totalArticles, currentScore = null, capOpts = {}) {
  if (items.length === 0) return { score_low: null, score_high: null, ci_unstable: false };

  const rng = createSeededRng(BOOTSTRAP_SEED ^ items.length);
  const { scores, nullSamples } = resampleScoreValues(items, componentId, totalArticles, rng, capOpts);
  if (scores.length === 0) return { score_low: null, score_high: null, ci_unstable: false };

  scores.sort((a, b) => a - b);
  const nullFraction = nullSamples / BOOTSTRAP_SAMPLES;
  if (nullFraction > CI_UNSTABLE_THRESHOLD) {
    return buildUnstableCi(scores, currentScore);
  }

  return {
    score_low: percentile(scores, 0.05),
    score_high: percentile(scores, 0.95),
    ci_unstable: false,
  };
}
