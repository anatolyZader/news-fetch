/**
 * Chat-parity evidence tools for assessment specialists (lookup_signals, get_source).
 */
import { loadSignals, searchSignals, formatSignals, getSource } from '../../business_modules/chat/index.js';

const COMPONENT_ENUM = [
  'narrative', 'information_communication', 'lifesaving_behavior', 'functional_continuity',
  'community_capital', 'leadership', 'belonging_solidarity', 'wellbeing_at_risk',
];

const SIGNAL_SOURCE_ENUM = ['news', 'radio', 'visits', 'pbo', 'pbo_regional', 'naftali', 'whatsapp', 'social'];

export function assessmentChatToolsEnabled() {
  const v = process.env.RESILIENCE_ASSESS_CHAT_TOOLS;
  return v == null || v === '' || v === '1' || v === 'true';
}

export const LOOKUP_SIGNALS_TOOL = {
  name: 'lookup_signals',
  description:
    'Search raw behavioral signals. Use AFTER archive retrieval to verify catalog refs or cite signal-level evidence.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Free-text search term (optional).' },
      component: { type: 'string', enum: COMPONENT_ENUM, description: 'Filter by component (optional).' },
      source_type: { type: 'string', enum: SIGNAL_SOURCE_ENUM, description: 'Filter by source type (optional).' },
      municipality: { type: 'string', description: 'Filter by municipality (optional).' },
      date: { type: 'string', description: 'Filter by date YYYY-MM-DD (optional).' },
      limit: { type: 'number', description: 'Max signals (default 10, max 25).' },
    },
  },
};

export const GET_SOURCE_TOOL = {
  name: 'get_source',
  description: 'Retrieve full original source text by source_id for verbatim quotes.',
  input_schema: {
    type: 'object',
    properties: {
      source_id: { type: 'string' },
      date: { type: 'string' },
      max_chars: { type: 'number', description: 'Default 8000, max 25000.' },
    },
  },
};

export const ASSESSMENT_EVIDENCE_TOOLS = [LOOKUP_SIGNALS_TOOL, GET_SOURCE_TOOL];

function resolveSignals(ctx, input) {
  if (Array.isArray(ctx.signals) && ctx.signals.length > 0) {
    return ctx.signals;
  }
  return loadSignals({ date: input.date ?? ctx.reportDate, sourceType: input.source_type });
}

function handleLookupSignals(input, ctx) {
  const signals = resolveSignals(ctx, input);
  if (!signals.length) {
    return 'No in-memory signals available for lookup. Use retrieve_for_claim or cross_source_compare first.';
  }
  const matches = searchSignals(signals, {
    query: input.query,
    component: input.component,
    sourceType: input.source_type,
    municipality: input.municipality,
    limit: Math.min(input.limit ?? 10, 25),
  });
  return formatSignals(matches);
}

function handleGetSource(input, ctx) {
  const source_id = input?.source_id ?? input?.evidence_id;
  if (!source_id) return 'get_source: source_id is required.';
  if (!ctx.sourceArchive) return 'get_source: source archive is not available.';
  return getSource(
    { ...input, source_id, date: input.date ?? ctx.reportDate },
    ctx.sourceArchive,
    ctx.evidenceStore ?? null,
  );
}

/**
 * @param {string} name
 * @param {object} input
 * @param {object} ctx
 */
export async function executeAssessmentEvidenceTool(name, input, ctx) {
  if (!assessmentChatToolsEnabled()) {
    return JSON.stringify({ error: 'chat_tools_disabled' });
  }
  switch (name) {
    case 'lookup_signals':
      return JSON.stringify({ result: handleLookupSignals(input ?? {}, ctx) });
    case 'get_source':
      return JSON.stringify({ result: handleGetSource(input ?? {}, ctx) });
    default:
      return JSON.stringify({ error: `unknown_evidence_tool:${name}` });
  }
}

export const MULTI_HOP_TOOL_NAMES = new Set([
  'retrieve_for_claim',
  'expand_source_neighborhood',
  'cross_source_compare',
  'temporal_trace',
  'recall_prior_assessments',
  'get_epistemic_profile',
]);

export const LOOKUP_TOOL_NAMES = new Set(['lookup_signals', 'get_source']);
