/**
 * Projects Google Trends interest through signal types → components via SIGNAL_TO_COMPONENTS.
 */

import { SIGNAL_TO_COMPONENTS } from '../../../resilience/domain/services/signalCatalog.js';
import { COMPONENT_IDS } from '../../../resilience/domain/services/behaviorSignals.js';
import { signalsForTopic } from '../trendQueryToSignals.js';
import { COMPONENT_LABEL_KEYS } from '../trendTopicComponentMap.js';
import {
  classifyTrendQuery,
  parseQueryInterestProxy,
} from './trendSignalClassifier.js';

const LEXICON_CHANNEL_SCALE = 0.45;
const SAI_SCALE = 1.15;

/**
 * @param {Array<Record<string, unknown>>} timeSeries
 * @param {string} topicId
 * @param {number} [maxPoints]
 */
function extractSparkline(timeSeries, topicId, maxPoints = 14) {
  if (!timeSeries?.length) return [];
  return timeSeries.slice(-maxPoints).map((row) => Number(row[topicId]) || 0);
}

/**
 * @param {number} sai
 * @param {number | null} changePct
 * @returns {'low'|'elevated'|'spike'}
 */
function interestBand(sai, changePct) {
  const v = sai ?? 0;
  const d = changePct ?? 0;
  if (v >= 70 || d >= 25) return 'spike';
  if (v >= 45 || d >= 12) return 'elevated';
  return 'low';
}

/**
 * @param {number} net
 * @param {number} absMass
 * @returns {'support'|'pressure'|'mixed'}
 */
function resolveDirection(net, absMass) {
  if (absMass < 3) return 'mixed';
  const ratio = Math.abs(net) / absMass;
  if (ratio < 0.25) return 'mixed';
  return net >= 0 ? 'support' : 'pressure';
}

/**
 * @param {string} componentId
 * @param {Map<string, { net: number, abs: number, changeNum: number, changeDen: number, topicSpark: Map<string, number>, signalContrib: Map<string, number> }>} acc
 */
function ensureComponent(acc, componentId) {
  if (!acc.has(componentId)) {
    acc.set(componentId, {
      net: 0,
      abs: 0,
      changeNum: 0,
      changeDen: 0,
      topicSpark: new Map(),
      signalContrib: new Map(),
    });
  }
  return acc.get(componentId);
}

/**
 * @param {Map<string, { net: number, abs: number, changeNum: number, changeDen: number, topicSpark: Map<string, number>, signalContrib: Map<string, number> }>} acc
 * @param {string} signalType
 * @param {number} interest
 * @param {number} signalWeight
 * @param {number | null} changePct
 * @param {string} [topicId]
 * @param {number} [obsWeight]
 */
function applySignalObservation(acc, signalType, interest, signalWeight, changePct, topicId, obsWeight = 1) {
  const mapping = SIGNAL_TO_COMPONENTS[signalType];
  if (!mapping) return;

  const base = interest * signalWeight * obsWeight;

  for (const [componentId, weight] of Object.entries(mapping)) {
    const row = ensureComponent(acc, componentId);
    const contrib = base * weight;
    row.net += contrib;
    row.abs += Math.abs(contrib);
    if (changePct != null) {
      row.changeNum += changePct * Math.abs(contrib);
      row.changeDen += Math.abs(contrib);
    }
    const prevSig = row.signalContrib.get(signalType) ?? 0;
    row.signalContrib.set(signalType, prevSig + Math.abs(contrib));
    if (topicId) {
      const prevTopic = row.topicSpark.get(topicId) ?? 0;
      row.topicSpark.set(topicId, prevTopic + Math.abs(signalWeight * obsWeight));
    }
  }
}

/**
 * @param {Map<string, { net: number, abs: number, changeNum: number, changeDen: number, topicSpark: Map<string, number>, signalContrib: Map<string, number> }>} acc
 * @param {string} componentId
 * @param {number} interest
 * @param {number} lexiconWeight
 * @param {number | null} changePct
 */
function applyLexiconHit(acc, componentId, interest, lexiconWeight, changePct) {
  const row = ensureComponent(acc, componentId);
  const contrib = interest * lexiconWeight * LEXICON_CHANNEL_SCALE;
  row.abs += contrib;
  row.net -= contrib * 0.35;
  if (changePct != null) {
    row.changeNum += changePct * contrib;
    row.changeDen += contrib;
  }
}

/**
 * @param {Map<string, number>} topicSpark
 * @param {Array<Record<string, unknown>>} timeSeries
 */
function blendSparkline(topicSpark, timeSeries) {
  const entries = [...topicSpark.entries()];
  if (!entries.length || !timeSeries?.length) return [];

  const total = entries.reduce((s, [, w]) => s + w, 0) || 1;
  const len = Math.min(14, timeSeries.length);
  const slice = timeSeries.slice(-len);

  return slice.map((row) => {
    let v = 0;
    for (const [topicId, w] of entries) {
      v += (Number(row[topicId]) || 0) * (w / total);
    }
    return Math.round(v);
  });
}

/**
 * @param {object} opts
 * @param {Array<{ id: string, latest?: number, changePct?: number | null }>} opts.topics
 * @param {Array<Record<string, unknown>>} [opts.timeSeries]
 * @param {Array<{ query: string, formattedValue?: string }>} [opts.popularQueries]
 * @param {Array<{ query: string, formattedValue?: string }>} [opts.risingQueries]
 */
export function projectSearchAttentionToComponents(opts) {
  const {
    topics = [],
    timeSeries = [],
    popularQueries = [],
    risingQueries = [],
  } = opts;

  /** @type {Map<string, { net: number, abs: number, changeNum: number, changeDen: number, topicSpark: Map<string, number>, signalContrib: Map<string, number> }>} */
  const acc = new Map();

  for (const topic of topics) {
    const interest = topic.latest ?? 0;
    const changePct = topic.changePct ?? null;
    for (const { type, weight } of signalsForTopic(topic.id)) {
      applySignalObservation(acc, type, interest, weight, changePct, topic.id, 1);
    }
  }

  const queryObs = [
    ...popularQueries.map((q) => ({ ...q, obsWeight: 0.85 })),
    ...risingQueries.map((q) => ({ ...q, obsWeight: 1 })),
  ];

  for (const row of queryObs) {
    const { interest } = parseQueryInterestProxy(row.formattedValue);
    const classified = classifyTrendQuery(row.query, row.formattedValue);
    const obsWeight = row.obsWeight ?? 1;

    for (const { type, confidence } of classified.signalTypes) {
      applySignalObservation(acc, type, interest, confidence, null, null, obsWeight);
    }
    for (const { componentId, weight } of classified.lexiconHits) {
      applyLexiconHit(acc, componentId, interest, weight, null);
    }
  }

  return COMPONENT_IDS.map((componentId) => {
    const row = acc.get(componentId);
    if (!row) {
      return {
        componentId,
        labelKey: COMPONENT_LABEL_KEYS[componentId] ?? componentId,
        sai: 0,
        netPressure: 0,
        direction: 'mixed',
        changePct: null,
        sparkline: [],
        topSignals: [],
        band: 'low',
      };
    }

    const sai = Math.min(100, Math.round(row.abs * SAI_SCALE));
    const changePct =
      row.changeDen > 0 ? Math.round(row.changeNum / row.changeDen) : null;
    const topSignals = [...row.signalContrib.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([type, magnitude]) => ({ type, magnitude: Math.round(magnitude) }));

    return {
      componentId,
      labelKey: COMPONENT_LABEL_KEYS[componentId] ?? componentId,
      sai,
      latest: sai,
      netPressure: Math.round(row.net * 10) / 10,
      direction: resolveDirection(row.net, row.abs),
      changePct,
      sparkline: blendSparkline(row.topicSpark, timeSeries),
      topSignals,
      band: interestBand(sai, changePct),
    };
  });
}
