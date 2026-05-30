/**
 * Claude tool schemas for chat agent.
 */

export const SOURCE_TYPE_ENUM = [
  'news', 'radio', 'field', 'pbo', 'pbo_regional', 'naftali', 'whatsapp',
  'social', 'audio', 'manual', 'video', 'probe',
];

const COMPONENT_ENUM = [
  'narrative', 'information_communication', 'lifesaving_behavior', 'functional_continuity',
  'community_capital', 'leadership', 'belonging_solidarity', 'wellbeing_at_risk',
];

const SIGNAL_SOURCE_ENUM = ['news', 'radio', 'field', 'pbo', 'pbo_regional', 'naftali', 'whatsapp', 'social'];

export const CORE_CHAT_TOOLS = [
  {
    name: 'lookup_pbo',
    description:
      'Look up detailed PBO (Population Behavior Officer) data for a specific municipality. ' +
      'Returns per-component scores and free-text field observations.',
    input_schema: {
      type: 'object',
      properties: {
        municipality: {
          type: 'string',
          description: 'Municipality name (Hebrew), as it appears in the PBO index.',
        },
      },
      required: ['municipality'],
    },
  },
  {
    name: 'lookup_signals',
    description:
      'Search raw behavioral signals extracted from news, radio, field reports, PBO, and Naftali questionnaires. ' +
      'Use this to find specific evidence, cite sources, or drill into a component or municipality.',
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
  },
  {
    name: 'compare_dates',
    description:
      'Compare two resilience assessment reports by date. Returns per-component score deltas and narrative shifts.',
    input_schema: {
      type: 'object',
      properties: {
        date_a: { type: 'string', description: 'Older date (YYYY-MM-DD).' },
        date_b: { type: 'string', description: 'Newer date (YYYY-MM-DD).' },
      },
      required: ['date_a', 'date_b'],
    },
  },
  {
    name: 'generate_brief',
    description:
      'Generate a structured resilience brief for commanders, analysts, or the public.',
    input_schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', enum: ['overall', 'municipality'] },
        municipality: { type: 'string', description: 'Required when scope is municipality.' },
        audience: { type: 'string', enum: ['commander', 'analyst', 'public'] },
        language: { type: 'string', enum: ['he', 'en'] },
      },
      required: ['scope', 'audience', 'language'],
    },
  },
  {
    name: 'list_sources',
    description: 'Browse original source documents for a date without a text query.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Start date YYYY-MM-DD.' },
        date_to: { type: 'string', description: 'Optional end date.' },
        source_type: { type: 'string', enum: SOURCE_TYPE_ENUM },
        limit: { type: 'number' },
        snippet_chars: { type: 'number' },
      },
    },
  },
  {
    name: 'search_sources',
    description: 'Find original source documents in the archive. Returns source_id for get_source.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        date_to: { type: 'string' },
        query: { type: 'string' },
        url: { type: 'string' },
        title: { type: 'string' },
        source_type: { type: 'string', enum: SOURCE_TYPE_ENUM },
        limit: { type: 'number' },
        snippet_chars: { type: 'number' },
      },
    },
  },
  {
    name: 'get_source',
    description: 'Retrieve full original source text by source_id from search_sources.',
    input_schema: {
      type: 'object',
      properties: {
        source_id: { type: 'string' },
        date: { type: 'string' },
        query: { type: 'string' },
        url: { type: 'string' },
        title: { type: 'string' },
        max_chars: { type: 'number', description: 'Default 8000, max 25000.' },
      },
    },
  },
];

export const ANALYST_READ_TOOLS = [
  {
    name: 'search_pbo_history',
    description: 'Search historical PBO municipal reports via archive RAG (analyst only).',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        date: { type: 'string', description: 'Report date YYYY-MM-DD.' },
        municipality: { type: 'string' },
        district: { type: 'string' },
        days: { type: 'number' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'list_pbo_reviews',
    description: 'List municipal PBO review records for a date (analyst only).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD.' },
      },
      required: ['date'],
    },
  },
  {
    name: 'get_pbo_review',
    description: 'Get PBO review detail for a municipality on a date (analyst only).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        municipality: { type: 'string' },
      },
      required: ['date', 'municipality'],
    },
  },
  {
    name: 'get_resilience_drift',
    description: 'Get resilience drift time series and alerts for a scope (analyst only).',
    input_schema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'national, north, south, etc.' },
        days: { type: 'number', description: '1-90, default 30.' },
        end_date: { type: 'string', description: 'YYYY-MM-DD.' },
      },
    },
  },
  {
    name: 'list_validation_queue',
    description: 'List validation review queue items for a date and scope (analyst only).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        scope: { type: 'string' },
        status: { type: 'string', description: 'Default pending.' },
      },
      required: ['date'],
    },
  },
  {
    name: 'get_validation_item',
    description: 'Get validation queue item with RAG context (analyst only).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        scope: { type: 'string' },
        article_key: { type: 'string' },
      },
      required: ['date', 'article_key'],
    },
  },
  {
    name: 'explain_validation_item',
    description:
      'One-shot LLM explanation of why a validation queue item was flagged (analyst only, read-only).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        scope: { type: 'string' },
        article_key: { type: 'string' },
        question: { type: 'string', description: 'Optional follow-up question.' },
      },
      required: ['date', 'article_key'],
    },
  },
  {
    name: 'list_geo_unknown',
    description: 'List geo unknown locality review queue entries (analyst only).',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'new, resolved, ignored, deferred.' },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'list_catalog_proposals',
    description: 'List OOV catalog draft proposals awaiting review (analyst only).',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['draft', 'approved', 'rejected'] },
        limit: { type: 'number' },
      },
    },
  },
  {
    name: 'get_catalog_gap_summary',
    description: 'Get summary of recent OOV capture clusters (analyst only).',
    input_schema: {
      type: 'object',
      properties: {
        max_days: { type: 'number' },
        top_n: { type: 'number' },
      },
    },
  },
];

export const PROPOSE_TOOLS = [
  {
    name: 'propose_validation_decision',
    description:
      'Propose a validation review decision (requires user confirmation in UI). Does NOT execute immediately.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string' },
        scope: { type: 'string' },
        article_key: { type: 'string' },
        action: {
          type: 'string',
          enum: ['label', 'skip', 'defer', 'gold_signal', 'confirm_social_quarantine', 'dismiss_social_quarantine'],
        },
        note: { type: 'string' },
      },
      required: ['date', 'article_key', 'action'],
    },
  },
  {
    name: 'propose_geo_unknown_update',
    description:
      'Propose updating a geo unknown queue entry status (requires user confirmation).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'number' },
        status: { type: 'string', enum: ['resolved', 'ignored', 'deferred'] },
        note: { type: 'string' },
      },
      required: ['id', 'status'],
    },
  },
  {
    name: 'propose_catalog_proposal_review',
    description:
      'Propose approving or rejecting a catalog signal-type draft proposal (requires user confirmation).',
    input_schema: {
      type: 'object',
      properties: {
        proposal_id: { type: 'string' },
        status: { type: 'string', enum: ['approved', 'rejected'] },
        note: { type: 'string' },
      },
      required: ['proposal_id', 'status'],
    },
  },
];

/** Tool name subsets for scoped chat modes. null profile = full default set. */
export const TOOL_PROFILES = {
  default: null,
  validation: [
    'list_validation_queue',
    'get_validation_item',
    'explain_validation_item',
    'lookup_signals',
    'search_sources',
    'get_source',
    'propose_validation_decision',
  ],
  sources: [
    'list_sources',
    'search_sources',
    'get_source',
  ],
};

function filterToolsByProfile(tools, profile) {
  const names = TOOL_PROFILES[profile];
  if (!names) return tools;
  const allowed = new Set(names);
  return tools.filter((t) => allowed.has(t.name));
}

export function buildChatToolList(opts = {}) {
  const profile = opts.toolProfile ?? 'default';
  let tools = [...CORE_CHAT_TOOLS];
  if (opts.analystToolsEnabled && opts.isAnalyst) {
    tools.push(...ANALYST_READ_TOOLS);
    if (opts.confirmActionsEnabled) {
      tools.push(...PROPOSE_TOOLS);
    }
  }
  if (profile !== 'default') {
    tools = filterToolsByProfile(tools, profile);
  }
  return tools;
}

export function buildSystemTemplateToolList(opts = {}) {
  const profile = opts.toolProfile ?? 'default';
  if (profile === 'validation') {
    const lines = [
      '- list_validation_queue / get_validation_item / explain_validation_item: validation review queue',
      '- explain_validation_item: one-shot explanation of a flagged item',
      '- lookup_signals: behavioral signal evidence',
      '- search_sources / get_source: original archive documents',
    ];
    if (opts.confirmActionsEnabled) {
      lines.push(
        '- propose_validation_decision: propose skip/label/defer (user must confirm in chat UI)',
      );
    }
    return lines.join('\n');
  }
  if (profile === 'sources') {
    return [
      '- list_sources / search_sources / get_source: original archive documents',
    ].join('\n');
  }
  const core = [
    '- lookup_pbo: detailed PBO municipality data',
    '- lookup_signals: search raw behavioral signals',
    '- compare_dates: compare two assessment dates',
    '- generate_brief: formatted brief for an audience',
    '- list_sources / search_sources / get_source: original archive documents',
  ];
  if (opts.analystToolsEnabled && opts.isAnalyst) {
    core.push(
      '- search_pbo_history / list_pbo_reviews / get_pbo_review: PBO analyst tools',
      '- get_resilience_drift: drift time series and alerts',
      '- list_validation_queue / get_validation_item / explain_validation_item: validation review queue',
      '- list_geo_unknown: geo unknown locality queue',
      '- list_catalog_proposals / get_catalog_gap_summary: OOV catalog proposals',
    );
    if (opts.confirmActionsEnabled) {
      core.push(
        '- propose_validation_decision / propose_geo_unknown_update / propose_catalog_proposal_review: ' +
        'mutations that require user confirmation in the chat UI — never claim an action was applied until confirmed',
      );
    }
  }
  return core.join('\n');
}
