/**
 * Validation review agent profile.
 */
import { registerProfileTools } from '../toolRegistry.js';

const VALIDATION_TOOLS = [
  {
    name: 'get_validation_context',
    description: 'Refresh validation item context (RAG bundle).',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'search_similar_articles',
    description: 'Search archive for articles similar to a query related to this item.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        top_k: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'propose_decision',
    description: 'Recommend a validation decision (does NOT submit — human must confirm).',
    input_schema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['label', 'skip', 'defer', 'gold_signal', 'confirm_social_quarantine', 'dismiss_social_quarantine'],
        },
        rationale: { type: 'string' },
      },
      required: ['action', 'rationale'],
    },
  },
];

registerProfileTools('validation', VALIDATION_TOOLS);

export const VALIDATION_PROFILE_ID = 'validation';
export { VALIDATION_TOOLS };
