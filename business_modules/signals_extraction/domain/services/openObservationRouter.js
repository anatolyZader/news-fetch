/**
 * Route open observations to resilience components (LLM batch with keyword fallback).
 */
import { jsonrepair } from 'jsonrepair';
import { HAIKU_MODEL } from '../../../../cross-cut-modules/agent/agentConfig.js';
import { getDefaultLlmPort } from '../../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { COMPONENT_IDS } from '../../../../cross-cut-modules/resilience-contracts/componentIds.js';
import { mapObservationToComponent } from '../../../../cross-cut-modules/retrieval/residualObservations.js';

function openObsRoutingMode(env = process.env) {
  const m = String(env.RESILIENCE_OPEN_OBS_ROUTING ?? 'llm').toLowerCase();
  return m === 'keyword' ? 'keyword' : 'llm';
}

const BATCH_SIZE = 40;

const ROUTER_SYSTEM = `You route open behavioral observations to one resilience component each.
Valid component_id values: ${COMPONENT_IDS.join(', ')}.
Return ONLY a JSON array: [{"observation_id":"...","component_id":"...","confidence":0.0-1.0}]`;

function confidenceRank(obs) {
  const map = { high: 3, medium: 2, low: 1 };
  return map[obs.confidence] ?? 2;
}

function parseRouterJson(text) {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  if (start === -1 || end === -1) throw new Error('Router returned no JSON array');
  const raw = text.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(jsonrepair(raw));
  }
}

/**
 * @param {object[]} observations
 * @param {object} [opts]
 */
export async function routeOpenObservations(observations, opts = {}) {
  if (!observations?.length) return [];

  const mode = opts.routingMode ?? openObsRoutingMode(opts.env);
  if (mode === 'keyword') {
    return observations.map((obs) => ({
      ...obs,
      component_id: obs.suggested_component && COMPONENT_IDS.includes(obs.suggested_component)
        ? obs.suggested_component
        : mapObservationToComponent(obs),
      routing_method: 'keyword',
    }));
  }

  const llmPort = opts.llmPort ?? getDefaultLlmPort();
  const routedById = new Map();

  for (let i = 0; i < observations.length; i += BATCH_SIZE) {
    const batch = observations.slice(i, i + BATCH_SIZE);
    const payload = batch.map((obs) => ({
      observation_id: obs.observation_id,
      behavioral_description: String(obs.behavioral_description ?? '').slice(0, 200),
      evidence: String(obs.evidence ?? '').slice(0, 200),
      suggested_catalog_types: obs.suggested_catalog_types ?? [],
      suggested_component: obs.suggested_component ?? null,
    }));

    try {
      const resp = await llmPort.createMessage({
        model: HAIKU_MODEL,
        max_tokens: 2048,
        system: ROUTER_SYSTEM,
        messages: [{ role: 'user', content: JSON.stringify(payload) }],
      });
      opts.onUsage?.(resp.usage);
      const text = (resp.content ?? [])
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      const rows = parseRouterJson(text);
      for (const row of rows) {
        const id = String(row.observation_id ?? '');
        const compId = COMPONENT_IDS.includes(row.component_id) ? row.component_id : 'narrative';
        routedById.set(id, {
          component_id: compId,
          routing_confidence: Number.isFinite(row.confidence) ? row.confidence : 0.6,
          routing_method: 'llm',
        });
      }
    } catch {
      for (const obs of batch) {
        routedById.set(obs.observation_id, {
          component_id: mapObservationToComponent(obs),
          routing_confidence: 0.4,
          routing_method: 'keyword_fallback',
        });
      }
    }
  }

  return observations
    .map((obs) => {
      const route = routedById.get(obs.observation_id) ?? {
        component_id: mapObservationToComponent(obs),
        routing_confidence: 0.4,
        routing_method: 'keyword_fallback',
      };
      return { ...obs, ...route };
    })
    .sort((a, b) => confidenceRank(b) - confidenceRank(a));
}
