/**
 * Assessment agent profile — planner, specialist, synthesizer tools.
 */
import { registerProfileTools } from '../toolRegistry.js';

function assessmentChatToolsEnabled() {
  const v = process.env.RESILIENCE_ASSESS_CHAT_TOOLS;
  return v == null || v === '' || v === '1' || v === 'true';
}

const LOOKUP_SIGNALS_TOOL = {
  name: 'lookup_signals',
  description:
    'Search raw behavioral signals. Use AFTER archive retrieval to verify catalog refs or cite signal-level evidence.',
  input_schema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      component: { type: 'string' },
      source_type: { type: 'string' },
      municipality: { type: 'string' },
      date: { type: 'string' },
      limit: { type: 'number' },
    },
  },
};

const GET_SOURCE_TOOL = {
  name: 'get_source',
  description: 'Retrieve full original source text by source_id for verbatim quotes.',
  input_schema: {
    type: 'object',
    properties: {
      source_id: { type: 'string' },
      date: { type: 'string' },
      max_chars: { type: 'number' },
    },
  },
};

export const MULTI_HOP_TOOLS = [
  {
    name: 'retrieve_for_claim',
    description: 'Find corroboration or contradiction for a specific claim.',
    input_schema: {
      type: 'object',
      properties: {
        claim_text: { type: 'string' },
        component_id: { type: 'string' },
        polarity: { type: 'string', enum: ['support', 'contradict', 'both'] },
      },
      required: ['claim_text'],
    },
  },
  {
    name: 'expand_source_neighborhood',
    description: 'Retrieve chunks from the same source/outlet/channel as a parent_id.',
    input_schema: {
      type: 'object',
      properties: {
        source_id: { type: 'string' },
        top_k: { type: 'number' },
      },
      required: ['source_id'],
    },
  },
  {
    name: 'cross_source_compare',
    description: 'Compare evidence across source types (pbo, visits, news, etc.) for a topic.',
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string' },
        source_types: { type: 'array', items: { type: 'string' } },
        component_id: { type: 'string' },
      },
      required: ['topic', 'source_types'],
    },
  },
  {
    name: 'temporal_trace',
    description: 'Trace how evidence on a topic evolved over a date window.',
    input_schema: {
      type: 'object',
      properties: {
        entity: { type: 'string' },
        window_days: { type: 'number' },
        component_id: { type: 'string' },
      },
      required: ['entity'],
    },
  },
  {
    name: 'recall_prior_assessments',
    description: 'Recall prior assessment summaries for a component over a window.',
    input_schema: {
      type: 'object',
      properties: {
        component_id: { type: 'string' },
        window_days: { type: 'number' },
      },
      required: ['component_id'],
    },
  },
  {
    name: 'get_epistemic_profile',
    description: 'Get frozen epistemic profile hints (mass, polarization, dominance warnings).',
    input_schema: {
      type: 'object',
      properties: {
        component_id: { type: 'string' },
      },
    },
  },
];

export const PLANNER_TOOLS = [
  {
    name: 'submit_plan',
    description: 'Submit investigation plan as structured JSON.',
    input_schema: {
      type: 'object',
      properties: {
        focus_components: { type: 'array', items: { type: 'string' } },
        investigation_tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              topic: { type: 'string' },
              sources: { type: 'array', items: { type: 'string' } },
              component_id: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
        gap_closure_tasks: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              gap_id: { type: 'string' },
              component_id: { type: 'string' },
              gap_type: { type: 'string', enum: ['investigation', 'data'] },
              action: { type: 'string' },
              type: { type: 'string' },
            },
          },
        },
        abstention_components: { type: 'array', items: { type: 'string' } },
        budget: {
          type: 'object',
          properties: {
            max_rounds: { type: 'number' },
            model_tier: { type: 'string' },
          },
        },
      },
      required: ['focus_components', 'investigation_tasks', 'abstention_components'],
    },
  },
];

export const SPECIALIST_TOOLS = [
  ...MULTI_HOP_TOOLS,
  ...(assessmentChatToolsEnabled() ? [LOOKUP_SIGNALS_TOOL, GET_SOURCE_TOOL] : []),
  {
    name: 'submit_component_assessment',
    description: 'Submit component assessment with claims and evidence refs.',
    input_schema: {
      type: 'object',
      properties: {
        component_id: { type: 'string' },
        severity: { type: 'string', enum: ['low', 'moderate', 'high', 'critical', 'abstain'] },
        confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
        operator_status: {
          type: 'string',
          enum: ['stable', 'watch', 'critical_failure', 'insufficient_data'],
        },
        claims: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              claim_id: { type: 'string' },
              text: { type: 'string' },
              evidence_refs: { type: 'array', items: { type: 'string' } },
              polarity: { type: 'string', enum: ['support', 'weaken', 'neutral'] },
              grounding_tier: { type: 'string' },
            },
            required: ['text', 'evidence_refs'],
          },
        },
        dissent_summary: { type: 'string' },
        narrative: { type: 'string' },
        retrieval_gaps: { type: 'array', items: { type: 'string' } },
      },
      required: ['component_id', 'severity', 'confidence', 'claims', 'narrative'],
    },
  },
];

export const SYNTHESIZER_TOOLS = [
  {
    name: 'submit_synthesis',
    description: 'Submit cross-component synthesis and attention items.',
    input_schema: {
      type: 'object',
      properties: {
        cross_component_synthesis: { type: 'string' },
        attention_items: { type: 'array', items: { type: 'object' } },
        decision_brief_summary: { type: 'string' },
        retrieval_gaps: { type: 'array', items: { type: 'string' } },
      },
      required: ['cross_component_synthesis'],
    },
  },
];

registerProfileTools('assessment_planner', PLANNER_TOOLS);
registerProfileTools('assessment_specialist', SPECIALIST_TOOLS);
registerProfileTools('assessment_synthesizer', SYNTHESIZER_TOOLS);

export const ASSESSMENT_PLANNER_PROFILE = 'assessment_planner';
export const ASSESSMENT_SPECIALIST_PROFILE = 'assessment_specialist';
export const ASSESSMENT_SYNTHESIZER_PROFILE = 'assessment_synthesizer';
