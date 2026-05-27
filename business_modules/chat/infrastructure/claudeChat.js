/**
 * Claude API interaction for chat — Haiku with tool use.
 */
import Anthropic from '@anthropic-ai/sdk';
import { loadSignals, searchSignals, formatSignals, compareReports } from '../domain/signalLookup.js';
import {
  deriveInstrumentState,
  operatorAssessmentSummary,
  DISPLAY_VIEWS,
} from '../../resilience/domain/services/assessmentDisplayTier.js';
import { lookupEvidenceText, searchEvidenceCandidates } from '../domain/evidenceLookup.js';

const client = new Anthropic();

const LOOKUP_PBO_TOOL = {
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
};

const LOOKUP_SIGNALS_TOOL = {
  name: 'lookup_signals',
  description:
    'Search raw behavioral signals extracted from news, radio, field reports, PBO, and Naftali questionnaires. ' +
    'Use this to find specific evidence, cite sources, or drill into a component or municipality. ' +
    'Returns matching signals with evidence text, source type, date, and article source.',
  input_schema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Free-text search term to match against signal evidence and type (optional).',
      },
      component: {
        type: 'string',
        enum: ['narrative', 'information_communication', 'lifesaving_behavior', 'functional_continuity', 'community_capital', 'leadership', 'belonging_solidarity', 'wellbeing_at_risk'],
        description: 'Filter by resilience component (optional).',
      },
      source_type: {
        type: 'string',
        enum: ['news', 'radio', 'field', 'pbo', 'naftali', 'whatsapp'],
        description: 'Filter by data source type (optional).',
      },
      municipality: {
        type: 'string',
        description: 'Filter signals mentioning this municipality name (optional).',
      },
      date: {
        type: 'string',
        description: 'Filter by date YYYY-MM-DD (optional). If omitted, searches all available dates.',
      },
      limit: {
        type: 'number',
        description: 'Max signals to return (default 10, max 25).',
      },
    },
  },
};

const COMPARE_DATES_TOOL = {
  name: 'compare_dates',
  description:
    'Compare two resilience assessment reports by date. Returns per-component score deltas, ' +
    'article count changes, and key narrative shifts between the two dates.',
  input_schema: {
    type: 'object',
    properties: {
      date_a: {
        type: 'string',
        description: 'Older date (YYYY-MM-DD).',
      },
      date_b: {
        type: 'string',
        description: 'Newer date (YYYY-MM-DD).',
      },
    },
    required: ['date_a', 'date_b'],
  },
};

const GENERATE_BRIEF_TOOL = {
  name: 'generate_brief',
  description:
    'Generate a structured resilience brief for commanders, analysts, or the public. ' +
    'Can produce an overall situation brief or a municipality-focused brief. ' +
    'Returns a formatted brief with key findings and recommendations.',
  input_schema: {
    type: 'object',
    properties: {
      scope: {
        type: 'string',
        enum: ['overall', 'municipality'],
        description: 'Scope of the brief.',
      },
      municipality: {
        type: 'string',
        description: 'Municipality name (required when scope is "municipality").',
      },
      audience: {
        type: 'string',
        enum: ['commander', 'analyst', 'public'],
        description: 'Target audience — affects tone, detail level, and recommendations.',
      },
      language: {
        type: 'string',
        enum: ['he', 'en'],
        description: 'Output language.',
      },
    },
    required: ['scope', 'audience', 'language'],
  },
};

const LOOKUP_EVIDENCE_TOOL = {
  name: 'lookup_evidence',
  description:
    'Retrieve full stored evidence/article text on demand (not in the main prompt). ' +
    'Searches the SQLite evidence store for a given date and/or the homefront markdown export for that date. ' +
    'Use when you need the full original text to answer precisely or quote. ' +
    'If date is omitted, it will default to the current assessment date.',
  input_schema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Date YYYY-MM-DD to search (usually the current report date).',
      },
      evidence_id: {
        type: 'string',
        description: 'Exact evidence identifier returned by search_evidence (preferred).',
      },
      query: {
        type: 'string',
        description: 'Free-text search term (matches title/url/body). Optional if url/title is provided.',
      },
      url: {
        type: 'string',
        description: 'Exact URL to retrieve (preferred when available).',
      },
      title: {
        type: 'string',
        description: 'Title substring to match.',
      },
      source_type: {
        type: 'string',
        enum: ['news', 'radio', 'field', 'pbo', 'naftali', 'whatsapp', 'audio', 'manual'],
        description: 'Optional filter for DB evidence_items source_type.',
      },
      limit: {
        type: 'number',
        description: 'Max items to return (default 3, max 10).',
      },
      max_chars: {
        type: 'number',
        description: 'Max characters of body per item (default 8000, max 25000).',
      },
    },
  },
};

const SEARCH_EVIDENCE_TOOL = {
  name: 'search_evidence',
  description:
    'Find the right evidence/article source before retrieving full text. ' +
    'Returns candidate evidence items (evidence_id, title, url, source, snippet). ' +
    'Then use lookup_evidence with evidence_id to retrieve the full text for quoting.',
  input_schema: {
    type: 'object',
    properties: {
      date: {
        type: 'string',
        description: 'Date YYYY-MM-DD to search (defaults to the current assessment date when omitted).',
      },
      query: {
        type: 'string',
        description: 'Free-text search term (matches title/url/body). Optional if url/title is provided.',
      },
      url: {
        type: 'string',
        description: 'Exact URL to match (preferred when available).',
      },
      title: {
        type: 'string',
        description: 'Title substring to match.',
      },
      source_type: {
        type: 'string',
        enum: ['news', 'radio', 'field', 'pbo', 'naftali', 'whatsapp', 'audio', 'manual'],
        description: 'Optional filter for DB evidence_items source_type.',
      },
      limit: {
        type: 'number',
        description: 'Max candidates (default 7, max 25).',
      },
      snippet_chars: {
        type: 'number',
        description: 'Max snippet characters (default 350, max 1200).',
      },
    },
  },
};

const ALL_TOOLS = [
  LOOKUP_PBO_TOOL,
  LOOKUP_SIGNALS_TOOL,
  COMPARE_DATES_TOOL,
  GENERATE_BRIEF_TOOL,
  SEARCH_EVIDENCE_TOOL,
  LOOKUP_EVIDENCE_TOOL,
];

const SYSTEM_TEMPLATE =
  `You are an expert in Israeli community resilience (Home Front Command / פיקוד העורף framework). ` +
  `Help the user understand population resilience assessments and act on insights.\n\n` +
  `TOOLS:\n` +
  `- lookup_pbo: detailed PBO municipality data (per-component scores + observer notes)\n` +
  `- lookup_signals: search raw behavioral signals by component, source, municipality, date, or keyword\n` +
  `- compare_dates: compare two assessment dates (score deltas + narrative shifts)\n` +
  `- generate_brief: produce a formatted brief for a specific audience (commander/analyst/public)\n` +
  `- search_evidence: find candidate evidence items (returns evidence_id)\n` +
  `- lookup_evidence: retrieve full stored article/evidence text on demand\n\n` +
  `GUIDELINES:\n` +
  `- When citing findings, use the lookup_signals tool to back claims with specific evidence.\n` +
  `- Default to evidence-first answers: when making factual claims, include a short quote and a source (url + evidence_id when available).\n` +
  `- If the user provides a snippet or mentions a site/source but you cannot locate the exact item, use search_evidence first, then lookup_evidence by evidence_id.\n` +
  `- When a question requires details that are only in the original article/evidence text (quotes, exact wording, who said what, specific instructions), use lookup_evidence before answering.\n` +
  `- When the user asks "what changed" or "why did X drop/rise", use compare_dates.\n` +
  `- When the user asks for a summary, brief, or output for someone else, use generate_brief.\n` +
  `- Be specific — cite municipality names, scores, dates, and observer notes.\n` +
  `- Answer in the same language the user writes in.\n\n` +
  `CONTEXT:\n`;

/**
 * Handle a tool call and return the result string.
 */
async function handleToolCall(toolName, input, pboLookup, reportData, evidenceStore) {
  if (toolName === 'lookup_pbo') {
    const muniName = input?.municipality ?? '';
    let result = pboLookup[muniName];
    if (!result) {
      const key = Object.keys(pboLookup).find(
        (k) => k.includes(muniName) || muniName.includes(k),
      );
      result = key ? pboLookup[key] : null;
    }
    return result ?? `No PBO data found for "${muniName}". Available: ${Object.keys(pboLookup).join(', ')}`;
  }

  if (toolName === 'lookup_signals') {
    const signals = loadSignals({
      date: input.date,
      sourceType: input.source_type,
    });
    const matches = searchSignals(signals, {
      query: input.query,
      component: input.component,
      sourceType: input.source_type,
      municipality: input.municipality,
      limit: Math.min(input.limit ?? 10, 25),
    });
    return formatSignals(matches);
  }

  if (toolName === 'compare_dates') {
    const includeScores = reportData?.display_view === DISPLAY_VIEWS.analyst;
    return compareReports(input.date_a, input.date_b, { includeScores });
  }

  if (toolName === 'generate_brief') {
    return await generateBrief(input, reportData, pboLookup);
  }

  if (toolName === 'lookup_evidence') {
    const inferredDate =
      input?.date ??
      reportData?.assessment?.date ??
      reportData?.reportDate ??
      null;
    return lookupEvidenceText({ ...input, date: inferredDate }, evidenceStore);
  }

  if (toolName === 'search_evidence') {
    const inferredDate =
      input?.date ??
      reportData?.assessment?.date ??
      reportData?.reportDate ??
      null;
    return searchEvidenceCandidates({ ...input, date: inferredDate }, evidenceStore);
  }

  return 'Unknown tool';
}

/**
 * Generate a brief using a separate Sonnet call.
 */
async function generateBrief(input, reportData, pboLookup) {
  const { scope, municipality, audience, language } = input;

  // Gather context
  let briefContext = '';
  if (reportData?.assessment) {
    const a = reportData.assessment;
    const includeScores = reportData?.display_view === DISPLAY_VIEWS.analyst;
    briefContext += `Assessment date: ${a.date}\n`;
    if (includeScores) {
      briefContext += `Overall score: ${a.overall_resilience_score}/10\n`;
    } else {
      briefContext += `${operatorAssessmentSummary(a)}\n`;
    }
    briefContext += `Executive summary: ${a.cross_component_synthesis?.slice(0, 2000) ?? 'N/A'}\n\n`;
    for (const c of a.components ?? []) {
      if (includeScores && c.score != null) {
        briefContext += `${c.component_id}: ${c.score}/10 (${c.confidence}) — ${c.narrative?.slice(0, 400) ?? ''}\n\n`;
      } else {
        const inst = c.instrument ?? deriveInstrumentState(c);
        briefContext +=
          `${c.component_id}: (${inst.confidence}, ${inst.evidence_sufficiency}) — ${c.narrative?.slice(0, 400) ?? ''}\n\n`;
      }
    }
  }

  if (scope === 'municipality' && municipality) {
    // Add PBO data
    const muniData = pboLookup[municipality] ??
      pboLookup[Object.keys(pboLookup).find((k) => k.includes(municipality) || municipality.includes(k))] ?? '';
    if (muniData) briefContext += `\nPBO data for ${municipality}:\n${muniData}\n`;

    // Add matching signals
    const signals = loadSignals({});
    const matches = searchSignals(signals, { municipality, limit: 15 });
    if (matches.length > 0) briefContext += `\nRecent signals for ${municipality}:\n${formatSignals(matches)}\n`;
  }

  const audienceInstructions = {
    commander: 'Write for a military/civil defense commander: concise, action-oriented, focus on operational gaps and recommended interventions. Use bullet points.',
    analyst: 'Write for a resilience analyst: evidence-rich, cite specific signals and sources, include confidence qualifiers, note contradictions.',
    public: 'Write for public communication: accessible language, no jargon, focus on what is being done and what people can do.',
  };

  const langInstructions = language === 'he'
    ? 'Write the brief in Hebrew.'
    : 'Write the brief in English.';

  const scopeInstructions = scope === 'municipality'
    ? `Focus the brief on the municipality: ${municipality}.`
    : 'Produce an overall situation brief covering all components.';

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    system: 'You are a resilience assessment brief writer. Produce a structured brief based on the provided assessment data.',
    messages: [{
      role: 'user',
      content:
        `${audienceInstructions[audience] ?? audienceInstructions.analyst}\n` +
        `${langInstructions}\n` +
        `${scopeInstructions}\n\n` +
        `DATA:\n${briefContext}`,
    }],
  });

  const text = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  return text || 'Brief generation returned empty.';
}

/**
 * Stream a chat response with tool use loop.
 * @param {string} systemContext - report context string
 * @param {object} pboLookup - municipality name → detail string
 * @param {Array} messages - conversation messages
 * @param {function} send - callback for SSE events: send({ type, ... })
 * @param {object} reportData - raw report data for brief generation
 * @param {{ evidenceStore?: object|null }} [opts]
 */
export async function streamChatResponse(systemContext, pboLookup, messages, send, reportData, opts = {}) {
  const system = SYSTEM_TEMPLATE + systemContext;
  const MAX_TOOL_ROUNDS = 5;
  let currentMessages = messages;
  const evidenceStore = opts.evidenceStore ?? null;

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4000,
      system,
      messages: currentMessages,
      tools: ALL_TOOLS,
    });

    const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
    const textBlocks = response.content.filter((b) => b.type === 'text');

    for (const tb of textBlocks) {
      if (tb.text) send({ type: 'text', text: tb.text });
    }

    if (toolUseBlocks.length === 0 || response.stop_reason === 'end_turn') {
      break;
    }

    const toolResults = [];
    for (const tu of toolUseBlocks) {
      const result = await handleToolCall(tu.name, tu.input, pboLookup, reportData, evidenceStore);
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tu.id,
        content: result,
      });
    }

    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: response.content },
      { role: 'user', content: toolResults },
    ];
  }
}

/**
 * Generate a short session title from the first user message.
 * Uses the same cheap model as chat (Haiku).
 * @param {string} seedText
 * @returns {Promise<string|null>} title or null if empty
 */
export async function generateChatTitle(seedText) {
  const text = String(seedText ?? '').trim();
  if (!text) return null;
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 24,
    system:
      'You create short chat titles. ' +
      'Return ONLY a concise title (2–5 words). No quotes. No punctuation at end.',
    messages: [{
      role: 'user',
      content:
        'Create a short title for this chat based on the first message.\n\n' +
        `MESSAGE:\n${text.slice(0, 500)}`,
    }],
  });
  const out = response.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
  if (!out) return null;
  return out.replaceAll(/["'`]/g, '').replaceAll(/[.。!！?？:：]+$/g, '').slice(0, 60).trim() || null;
}
