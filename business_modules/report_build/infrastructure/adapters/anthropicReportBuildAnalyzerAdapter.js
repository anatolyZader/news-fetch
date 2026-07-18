import { createAnthropicLlmPort } from '../../../../cross-cut-modules/llm/anthropicLlmAdapter.js';
import { HAIKU_MODEL } from '../../../../cross-cut-modules/llm/modelIds.js';
import { createLlmGateway } from '../../../../cross-cut-modules/llm/llmGateway.js';
import { extractJsonArray, SIGNAL_TYPES } from '../../../resilience_scorer/index.js';
import {
  COMPONENT_IDS,
  SPREAD_VALUES,
  SOURCE_BASIS_VALUES,
  COMPARISON_VALUES,
  DIRECTION_VALUES,
  CONFIDENCE_LEVELS,
} from '../../domain/evidenceRequirements.js';

const VALID_SIGNAL_TYPES = new Set(SIGNAL_TYPES);
const VALID_COMPONENT_IDS = new Set(COMPONENT_IDS);
const VALID_SPREAD = new Set(SPREAD_VALUES);
const VALID_SOURCE_BASIS = new Set(SOURCE_BASIS_VALUES);
const VALID_COMPARISON = new Set(COMPARISON_VALUES);
const VALID_DIRECTION = new Set(DIRECTION_VALUES);
const VALID_CONFIDENCE = new Set(CONFIDENCE_LEVELS);

const DEFAULT_ASSESSMENT = () => ({
  sufficient: false,
  missing: ['specific_details'],
  missingByComponent: [],
  topQuestions: [],
});

const EMPTY_STRUCTURED = () => ({
  observation: {
    locality: null,
    timeframe: null,
    behavior: null,
    affectedPopulation: null,
    spread: null,
    sourceBasis: null,
    comparisonToPrior: null,
  },
  interpretation: { possibleDrivers: [], alternatives: [] },
  componentLinks: [],
  confidence: { level: null, basis: null },
});

function findObjectStartBeforeAnchor(responseText, anchorIdx) {
  for (let i = anchorIdx; i >= 0; i--) {
    if (responseText[i] === '{') return i;
  }
  return -1;
}

function advanceJsonBraceState(ch, state) {
  if (state.escape) {
    state.escape = false;
    return null;
  }
  if (ch === '\\') {
    state.escape = true;
    return null;
  }
  if (ch === '"') {
    state.inString = !state.inString;
    return null;
  }
  if (state.inString) return null;
  if (ch === '{') {
    state.depth++;
    return null;
  }
  if (ch !== '}') return null;
  state.depth--;
  return state.depth === 0;
}

function tryParseEmbeddedValue(responseText, start, key) {
  const state = { depth: 0, inString: false, escape: false };
  for (let i = start; i < responseText.length; i++) {
    if (!advanceJsonBraceState(responseText[i], state)) continue;
    try {
      const parsed = JSON.parse(responseText.slice(start, i + 1));
      return parsed[key] ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

function parseEmbeddedJsonObject(responseText, key) {
  const anchorIdx = responseText.indexOf(`"${key}"`);
  if (anchorIdx === -1) return null;
  const start = findObjectStartBeforeAnchor(responseText, anchorIdx);
  if (start === -1) return null;
  return tryParseEmbeddedValue(responseText, start, key);
}

function validateSignals(signals) {
  return signals.filter((s) => VALID_SIGNAL_TYPES.has(s?.signal_type));
}

function trimStringOrNull(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeObservationFields(target, observation) {
  if (!observation || typeof observation !== 'object') return;
  target.locality = trimStringOrNull(observation.locality);
  target.timeframe = trimStringOrNull(observation.timeframe);
  target.behavior = trimStringOrNull(observation.behavior);
  target.affectedPopulation = trimStringOrNull(observation.affectedPopulation);
  target.spread = VALID_SPREAD.has(observation.spread) ? observation.spread : null;
  target.sourceBasis = VALID_SOURCE_BASIS.has(observation.sourceBasis) ? observation.sourceBasis : null;
  target.comparisonToPrior = VALID_COMPARISON.has(observation.comparisonToPrior) ? observation.comparisonToPrior : null;
}

function normalizeStringList(value, maxItems) {
  return Array.isArray(value)
    ? value.filter((x) => typeof x === 'string' && x.trim()).slice(0, maxItems)
    : [];
}

function normalizeComponentLinks(componentLinks) {
  if (!Array.isArray(componentLinks)) return [];
  return componentLinks
    .filter((l) => l && VALID_COMPONENT_IDS.has(l.componentId))
    .map((l) => ({
      componentId: l.componentId,
      direction: VALID_DIRECTION.has(l.direction) ? l.direction : 'mixed',
      rationale: typeof l.rationale === 'string' ? l.rationale.slice(0, 300) : '',
    }))
    .slice(0, 6);
}

function normalizeStructured(raw) {
  const out = EMPTY_STRUCTURED();
  if (!raw || typeof raw !== 'object') return out;

  normalizeObservationFields(out.observation, raw.observation);
  out.interpretation.possibleDrivers = normalizeStringList(raw.interpretation?.possibleDrivers, 8);
  out.interpretation.alternatives = normalizeStringList(raw.interpretation?.alternatives, 5);
  out.componentLinks = normalizeComponentLinks(raw.componentLinks);

  if (raw.confidence && typeof raw.confidence === 'object') {
    out.confidence.level = VALID_CONFIDENCE.has(raw.confidence.level) ? raw.confidence.level : null;
    out.confidence.basis = typeof raw.confidence.basis === 'string' ? raw.confidence.basis.slice(0, 300) : null;
  }

  return out;
}

function normalizeAssessment(raw) {
  const out = DEFAULT_ASSESSMENT();
  if (!raw || typeof raw !== 'object') return out;

  out.sufficient = !!raw.sufficient;
  out.topQuestions = Array.isArray(raw.topQuestions)
    ? raw.topQuestions
        .filter((q) => typeof q === 'string' && q.trim())
        .map((q) => q.trim().slice(0, 220))
        .slice(0, 3)
    : [];
  return out;
}

function parseCommonOutput(responseText) {
  let rawArray;
  try {
    rawArray = extractJsonArray(responseText);
  } catch {
    return { signals: [], inlineAssessment: null, inlineStructured: null };
  }

  let inlineAssessment = null;
  let inlineStructured = null;
  const signals = [];

  for (const item of Array.isArray(rawArray) ? rawArray : [rawArray]) {
    if (item && typeof item === 'object') {
      if (item._assessment) {
        inlineAssessment = item._assessment;
        continue;
      }
      if (item._structured) {
        inlineStructured = item._structured;
        continue;
      }
      signals.push(item);
    }
  }

  return { signals, inlineAssessment, inlineStructured };
}

function formatTurnHistory(turnHistory, senderName) {
  const officerSuffix = senderName ? ' ' + senderName : '';
  const header = '[dialogue with field officer' + officerSuffix + ']';
  const lines = turnHistory.map((t) => {
    const role = t.role === 'bot' ? '[bot]' : '[officer]';
    const text = (t.text ?? '').trim();
    return `${role} ${text}`;
  });
  return `${header}\n${lines.join('\n')}`;
}

/**
 * @param {{ anthropicApiKey: string }} deps
 */
export function createAnthropicReportBuildAnalyzerAdapter({ anthropicApiKey, buildSignalExtractionSystemPrompt }) {
  if (!buildSignalExtractionSystemPrompt) {
    throw new Error('createAnthropicReportBuildAnalyzerAdapter requires buildSignalExtractionSystemPrompt');
  }
  const port = createLlmGateway(createAnthropicLlmPort({ apiKey: anthropicApiKey }));
  const interactiveSystemPrompt = buildSignalExtractionSystemPrompt('whatsapp_interactive');

  const model = HAIKU_MODEL;

  async function callModel({ system, userContent, maxTokens, onUsage, label }) {
    const response = await port.createMessage({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: userContent }],
      callContext: { feature: 'report_build', purpose: label ?? 'report-build:analyze' },
    });
    if (onUsage && response.usage) {
      onUsage({ label: label ?? 'report-build:analyze', model, usage: response.usage });
    }
    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  return {
    async analyzeTurnHistory(turnHistory, senderName, ragContext = null, opts = {}) {
      if (!Array.isArray(turnHistory) || turnHistory.length === 0) {
        return { signals: [], structured: EMPTY_STRUCTURED(), assessment: DEFAULT_ASSESSMENT() };
      }

      let userContent =
        `Analyze this ongoing field-report dialogue with an Israeli field officer:\n\n` +
        `[1] ${formatTurnHistory(turnHistory, senderName)}\n`;
      const ragBlock = String(ragContext?.blockText ?? '').trim();
      if (ragBlock) userContent += `\n${ragBlock}\n`;

      const responseText = await callModel({
        system: interactiveSystemPrompt,
        userContent,
        maxTokens: 3000,
        onUsage: opts.onUsage ?? null,
        label: 'report-build:analyze-turn',
      });

      if (!responseText) {
        return { signals: [], structured: EMPTY_STRUCTURED(), assessment: DEFAULT_ASSESSMENT() };
      }

      const { signals, inlineAssessment, inlineStructured } = parseCommonOutput(responseText);
      const trailingStructured = parseEmbeddedJsonObject(responseText, '_structured');
      const trailingAssessment = parseEmbeddedJsonObject(responseText, '_assessment');

      return {
        signals: validateSignals(signals),
        structured: normalizeStructured(inlineStructured ?? trailingStructured),
        assessment: normalizeAssessment(inlineAssessment ?? trailingAssessment),
      };
    },
  };
}

