import Anthropic from '@anthropic-ai/sdk';
import { extractJsonArray, SIGNAL_TYPES } from '../../../../cross-cut-modules/resilience-contracts/index.js';
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

function parseEmbeddedJsonObject(responseText, key) {
  const anchor = `"${key}"`;
  const anchorIdx = responseText.indexOf(anchor);
  if (anchorIdx === -1) return null;
  let start = -1;
  for (let i = anchorIdx; i >= 0; i--) {
    if (responseText[i] === '{') {
      start = i;
      break;
    }
  }
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < responseText.length; i++) {
    const ch = responseText[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\') {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const slice = responseText.slice(start, i + 1);
        try {
          const parsed = JSON.parse(slice);
          return parsed[key] ?? null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function validateSignals(signals) {
  return signals.filter((s) => VALID_SIGNAL_TYPES.has(s?.signal_type));
}

function normalizeStructured(raw) {
  const out = EMPTY_STRUCTURED();
  if (!raw || typeof raw !== 'object') return out;

  if (raw.observation && typeof raw.observation === 'object') {
    const o = raw.observation;
    out.observation.locality = typeof o.locality === 'string' && o.locality.trim() ? o.locality.trim() : null;
    out.observation.timeframe = typeof o.timeframe === 'string' && o.timeframe.trim() ? o.timeframe.trim() : null;
    out.observation.behavior = typeof o.behavior === 'string' && o.behavior.trim() ? o.behavior.trim() : null;
    out.observation.affectedPopulation =
      typeof o.affectedPopulation === 'string' && o.affectedPopulation.trim() ? o.affectedPopulation.trim() : null;
    out.observation.spread = VALID_SPREAD.has(o.spread) ? o.spread : null;
    out.observation.sourceBasis = VALID_SOURCE_BASIS.has(o.sourceBasis) ? o.sourceBasis : null;
    out.observation.comparisonToPrior = VALID_COMPARISON.has(o.comparisonToPrior) ? o.comparisonToPrior : null;
  }

  if (raw.interpretation && typeof raw.interpretation === 'object') {
    out.interpretation.possibleDrivers = Array.isArray(raw.interpretation.possibleDrivers)
      ? raw.interpretation.possibleDrivers.filter((x) => typeof x === 'string' && x.trim()).slice(0, 8)
      : [];
    out.interpretation.alternatives = Array.isArray(raw.interpretation.alternatives)
      ? raw.interpretation.alternatives.filter((x) => typeof x === 'string' && x.trim()).slice(0, 5)
      : [];
  }

  if (Array.isArray(raw.componentLinks)) {
    out.componentLinks = raw.componentLinks
      .filter((l) => l && VALID_COMPONENT_IDS.has(l.componentId))
      .map((l) => ({
        componentId: l.componentId,
        direction: VALID_DIRECTION.has(l.direction) ? l.direction : 'mixed',
        rationale: typeof l.rationale === 'string' ? l.rationale.slice(0, 300) : '',
      }))
      .slice(0, 6);
  }

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
  const header = `[dialogue with field officer${senderName ? ` ${senderName}` : ''}]`;
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
  const client = new Anthropic({ apiKey: anthropicApiKey });
  const interactiveSystemPrompt = buildSignalExtractionSystemPrompt('whatsapp_interactive');

  const model = 'claude-haiku-4-5-20251001';

  async function callModel({ system, userContent, maxTokens, onUsage, label }) {
    const response = await client.messages.create({
      model,
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: userContent }],
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

