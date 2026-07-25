/**
 * Claude tool schemas for chat agent.
 */
import { operatorEpistemicOverlayEnabled, SIGNAL_TYPES } from '../../../resilience_scorer/index.js';
import { pboReviewRagEnabled } from '../../../../cross-cut-modules/retrieval/ragConfig.js';

export const SOURCE_TYPE_ENUM = [
  'news', 'radio', 'visits', 'pbo', 'pbo_regional', 'naftali', 'whatsapp',
  'social', 'audio', 'manual', 'video', 'probe',
];

const COMPONENT_ENUM = [
  'narrative', 'information_communication', 'lifesaving_behavior', 'functional_continuity',
  'community_capital', 'leadership', 'belonging_solidarity', 'wellbeing_at_risk',
];

const SIGNAL_SOURCE_ENUM = ['news', 'radio', 'visits', 'pbo', 'pbo_regional', 'naftali', 'whatsapp', 'social'];

export const CORE_CHAT_TOOLS = [
  {
    name: 'lookup_pbo',
    description:
      'Look up detailed PBO (Population Behavior Officer) data for a specific municipality. ' +
      'Returns per-component scores and free-text field observations, labeled with the PBO report date. ' +
      'Without a date it serves the latest available collection (labeled "last collected <date>"); ' +
      'with a date it serves exactly that day or lists the dates PBO reports exist for.',
    input_schema: {
      type: 'object',
      properties: {
        municipality: {
          type: 'string',
          description: 'Municipality name (Hebrew), as it appears in the PBO index.',
        },
        date: {
          type: 'string',
          description: 'PBO report date YYYY-MM-DD (optional; defaults to the loaded report date).',
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
        signal_type: {
          type: 'string',
          enum: SIGNAL_TYPES,
          description: 'Exact catalog signal type (optional) — prefer over free-text query when the type is known.',
        },
        source_type: { type: 'string', enum: SIGNAL_SOURCE_ENUM, description: 'Filter by source type (optional).' },
        municipality: { type: 'string', description: 'Filter by municipality (optional).' },
        date: { type: 'string', description: 'Filter by date YYYY-MM-DD (optional).' },
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD inclusive (optional).' },
        date_to: { type: 'string', description: 'End date YYYY-MM-DD inclusive (optional).' },
        group_by: { type: 'string', enum: ['date'], description: 'Group results by date (optional).' },
        limit: { type: 'number', description: 'Max signals (default 10, max 25).' },
      },
    },
  },
  {
    name: 'get_component_evidence_bundle',
    description:
      'THE default deep-dive tool for component questions: the full evidence pool behind a component ' +
      '(claims, epistemic roles, signal types, evidence text, urls) — far more than the curated evidence ' +
      'rendered on the site. Works on the current report or a past one when date is set; ' +
      'falls back to structured operator evidence on non-rich reports.',
    input_schema: {
      type: 'object',
      properties: {
        component: { type: 'string', enum: COMPONENT_ENUM, description: 'Component id (required).' },
        role: {
          type: 'string',
          enum: ['scored', 'context_only', 'quarantined', 'investigation_only'],
          description: 'Filter by operator epistemic role (optional).',
        },
        limit: { type: 'number', description: 'Max pool items (default 50, max 100).' },
        date: { type: 'string', description: 'Past report date YYYY-MM-DD (optional; defaults to the current report).' },
        scope: { type: 'string', enum: ['national', 'north'], description: 'Report scope (defaults to the loaded report\'s scope).' },
      },
      required: ['component'],
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
        scope: { type: 'string', enum: ['national', 'north'], description: 'Report scope (defaults to the loaded report\'s scope).' },
        component: { type: 'string', enum: COMPONENT_ENUM, description: 'Limit the comparison to one component (optional).' },
      },
      required: ['date_a', 'date_b'],
    },
  },
  {
    name: 'trace_component_timeline',
    description:
      'Trace how a resilience component evolved across many assessment dates in one call. ' +
      'Returns per-date analyzed_at (date and time when available), instrument, narrative excerpt, ' +
      'PBO municipal scores (when municipality set), and signal counts. Use for multi-date evolution — not pairwise compare_dates.',
    input_schema: {
      type: 'object',
      properties: {
        component: { type: 'string', enum: COMPONENT_ENUM, description: 'Component id (required).' },
        municipality: { type: 'string', description: 'Municipality name Hebrew or English (optional).' },
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD (optional).' },
        date_to: { type: 'string', description: 'End date YYYY-MM-DD (optional).' },
      },
      required: ['component'],
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
        language: { type: 'string', enum: ['he', 'en', 'ru'] },
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
  {
    name: 'get_report',
    description:
      'Load a past resilience assessment report by date — compact operator-view summary ' +
      '(header + per-component instrument lines). Use compare_dates for pairwise deltas, ' +
      'trace_component_timeline for evolution.',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD (see Report dates in context).' },
        scope: { type: 'string', enum: ['national', 'north'], description: 'Report scope (default national).' },
      },
      required: ['date'],
    },
  },
  {
    name: 'get_report_context',
    description:
      'Fetch a different slice of report context when the current context is too thin ' +
      '(e.g. full detail, a single component narrative, or the priorities hub). ' +
      'Defaults to the currently loaded report; pass date (and scope) to get detailed narrative for a past report — ' +
      'this is the way to reach past-date component narratives.',
    input_schema: {
      type: 'object',
      properties: {
        slice: { type: 'string', enum: ['full', 'component', 'hub', 'standard'], description: 'Context slice to load.' },
        component: { type: 'string', enum: COMPONENT_ENUM, description: 'Required when slice is component.' },
        date: { type: 'string', description: 'Past report date YYYY-MM-DD (optional; defaults to the currently loaded report).' },
        scope: { type: 'string', enum: ['national', 'north'], description: 'Report scope (defaults to the loaded report\'s scope).' },
      },
      required: ['slice'],
    },
  },
  {
    name: 'signal_stats',
    description:
      'Aggregate signal counts (no excerpts) grouped by type, municipality, date, or source. ' +
      'Use for "how many"-style questions instead of listing signals.',
    input_schema: {
      type: 'object',
      properties: {
        date_from: { type: 'string', description: 'Start date YYYY-MM-DD inclusive (optional).' },
        date_to: { type: 'string', description: 'End date YYYY-MM-DD inclusive (optional).' },
        component: { type: 'string', enum: COMPONENT_ENUM, description: 'Filter by component (optional).' },
        signal_type: { type: 'string', description: 'Exact catalog signal type id (optional; same ids as the lookup_signals enum).' },
        source_type: { type: 'string', enum: SIGNAL_SOURCE_ENUM, description: 'Filter by source type (optional).' },
        municipality: { type: 'string', description: 'Filter by municipality (optional).' },
        group_by: { type: 'string', enum: ['signal_type', 'municipality', 'date', 'source_type'] },
      },
      required: ['group_by'],
    },
  },
  {
    name: 'list_attention_items',
    description:
      'List ranked attention items for the loaded assessment (data void, patterns, thin evidence, recommendations).',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max items (default 15, max 25).' },
      },
    },
  },
  {
    name: 'list_operator_recommendations',
    description:
      'List operator recommendations from the loaded assessment (pending, acknowledged, dismissed).',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'acknowledged', 'dismissed', 'all'], description: 'Default pending.' },
      },
    },
  },
  {
    name: 'get_decision_brief',
    description:
      'Get the batch-generated operator decision brief (summary and priority items) for the loaded assessment.',
    input_schema: { type: 'object', properties: {} },
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
    name: 'list_observations',
    description: 'List open (unmapped) behavioral observations from extraction bundles (analyst only).',
    input_schema: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'YYYY-MM-DD (optional).' },
        profile: { type: 'string', description: 'Extraction profile filter (optional).' },
        limit: { type: 'number', description: 'Max observations (default 20, max 50).' },
      },
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
];

export const PROPOSE_TOOLS = [
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
];

export const OPERATOR_PROPOSE_TOOLS = [
  {
    name: 'propose_operator_recommendation',
    description:
      'Propose acknowledging or dismissing a pending operator recommendation from the loaded assessment ' +
      '(requires user confirmation in UI). Does NOT execute immediately.',
    input_schema: {
      type: 'object',
      properties: {
        recommendation_id: { type: 'string', description: 'ID from operator_recommendations (e.g. rec:information_vacuum_rumor).' },
        scope: { type: 'string', description: 'Report scope (national, north, …).' },
        date: { type: 'string', description: 'Assessment date YYYY-MM-DD.' },
        action: { type: 'string', enum: ['acknowledge', 'dismiss'] },
        rationale: { type: 'string', description: 'Optional note for audit log.' },
      },
      required: ['recommendation_id', 'action'],
    },
  },
];

/** Guidance tools suppressed when RESILIENCE_OPERATOR_EPISTEMIC_OVERLAY=0 (narrative-first operator UI). */
export const GUIDANCE_CHAT_TOOL_NAMES = new Set([
  'list_attention_items',
  'get_decision_brief',
  'list_operator_recommendations',
  'propose_operator_recommendation',
]);

function excludeGuidanceTools(tools, opts = {}) {
  if (operatorEpistemicOverlayEnabled() || opts.isAnalyst) return tools;
  return tools.filter((t) => !GUIDANCE_CHAT_TOOL_NAMES.has(t.name));
}

/** Tool name subsets for scoped chat modes. null profile = full default set. */
export const TOOL_PROFILES = {
  default: null,
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
  if (opts.confirmActionsEnabled) {
    tools.push(...OPERATOR_PROPOSE_TOOLS);
  }
  if (opts.analystToolsEnabled && opts.isAnalyst) {
    tools.push(...ANALYST_READ_TOOLS);
    if (opts.confirmActionsEnabled) {
      tools.push(...PROPOSE_TOOLS);
    }
  }
  if (profile !== 'default') {
    tools = filterToolsByProfile(tools, profile);
  }
  return excludeGuidanceTools(tools, opts);
}

export function buildSystemTemplateToolList(opts = {}) {
  const profile = opts.toolProfile ?? 'default';
  if (profile === 'sources') {
    return [
      '- list_sources / search_sources / get_source: original archive documents',
    ].join('\n');
  }
  const core = [
    '- get_component_evidence_bundle: full evidence pool behind a component (all epistemic roles) — the default deep-dive for component questions',
    '- lookup_pbo: detailed PBO municipality data (date-aware; a miss lists the dates PBO reports exist for)',
    '- lookup_signals: search raw behavioral signals',
    '- signal_stats: aggregate signal counts (by type / municipality / date / source) — prefer for "how many" questions',
    '- compare_dates: compare two assessment dates (pairwise only)',
    '- trace_component_timeline: multi-date component evolution (prefer over compare_dates for timelines)',
    '- get_report: load a past report summary by date',
    '- get_report_context: fetch a fuller slice of the loaded report (or a past date) when context is thin',
    '- generate_brief: formatted brief for an audience',
    '- list_sources / search_sources / get_source: original archive documents',
  ];
  if (operatorEpistemicOverlayEnabled() || opts.isAnalyst) {
    core.push(
      '- list_attention_items: ranked what-needs-attention queue',
      '- list_operator_recommendations: pending suggested actions',
      '- get_decision_brief: batch operator decision brief',
    );
  } else {
    core.push(
      '- Default to evidence-first answers: cite component narratives and lookup_signals / get_source quotes.',
    );
  }
  if (opts.confirmActionsEnabled && (operatorEpistemicOverlayEnabled() || opts.isAnalyst)) {
    core.push(
      '- propose_operator_recommendation: acknowledge/dismiss pending operator recommendations (user must confirm)',
    );
  }
  if (opts.analystToolsEnabled && opts.isAnalyst) {
    const pboLines = [
      '- list_pbo_reviews / get_pbo_review: PBO analyst tools',
    ];
    if (pboReviewRagEnabled()) {
      pboLines.unshift('- search_pbo_history: PBO archive RAG search');
    }
    core.push(
      ...pboLines,
      '- list_geo_unknown: geo unknown locality queue',
      '- list_observations: open (unmapped) observation bundles',
    );
    if (opts.confirmActionsEnabled) {
      core.push(
        '- propose_geo_unknown_update: mutation that requires user confirmation in the chat UI — ' +
        'never claim an action was applied until confirmed',
      );
    }
  }
  return core.join('\n');
}
