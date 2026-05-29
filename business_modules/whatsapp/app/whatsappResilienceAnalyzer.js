/**
 * Real-time resilience signal extraction for WhatsApp field reports.
 *
 * Two modes:
 *   analyzeMessage(text, senderName)
 *     — single-shot (group flow). Uses the "whatsapp_realtime" prompt.
 *       Returns { signals[], assessment{ sufficient, missing[] } }.
 *
 *   analyzeTurnHistory(turnHistory, senderName)
 *     — multi-turn DM flow. Uses the "whatsapp_interactive" prompt.
 *       Returns { signals[], assessment{ sufficient, missing[], missingByComponent[], topQuestions[] },
 *                 structured{ observation, interpretation, componentLinks, confidence } }.
 */

import Anthropic from '@anthropic-ai/sdk';
import { attachGeoToSignalsAndStructured } from '../../../cross-cut-modules/geo/attachGeoToSignals.js';
import {
  inferLocalityFromText,
  normalizeLocalityName,
} from '../../../cross-cut-modules/geo/localityCandidate.js';
import { buildSignalExtractionSystemPrompt, extractJsonArray } from '../../resilience/infrastructure/claudeEvaluator.js';
import { applySourceNativeGrounding } from '../../resilience/infrastructure/sourceNativeGrounding.js';
import { createNoOpGeoEnrichmentPort } from '../../resilience/infrastructure/adapters/geoEnrichmentAdapter.js';
import { enrichFieldProvenance } from '../../resilience/domain/services/fieldSignalPolicy.js';
import { COMPONENT_IDS, SPREAD_VALUES, SOURCE_BASIS_VALUES, COMPARISON_VALUES, DIRECTION_VALUES, CONFIDENCE_LEVELS } from '../domain/evidenceRequirements.js';
import { SIGNAL_TYPES } from '../../resilience/domain/services/behaviorSignals.js';

const VALID_SIGNAL_TYPES = new Set(SIGNAL_TYPES);
const VALID_EVIDENCE_TYPES = new Set([
  'direct_quote_named_person', 'named_survey_statistic',
  'named_institutional_fact', 'observational_reported_fact',
]);
const INDIVIDUAL_EMOTIONAL_SIGNAL_TYPES = new Set([
  'fear_expression', 'calm_confidence',
]);
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
    locality: null, localityKey: null, localityHint: null,
    timeframe: null, behavior: null, affectedPopulation: null,
    spread: null, sourceBasis: null, comparisonToPrior: null,
  },
  interpretation: { possibleDrivers: [], alternatives: [] },
  componentLinks: [],
  confidence: { level: null, basis: null },
});

// ── Helpers ────────────────────────────────────────────────────────────────

function parseEmbeddedJsonObject(responseText, key) {
  // Find {"_structured": {...}} or {"_assessment": {...}} on its own line.
  // Allow arbitrary depth — match balanced braces from the anchor.
  const anchor = `"${key}"`;
  const anchorIdx = responseText.indexOf(anchor);
  if (anchorIdx === -1) return null;
  // Walk backwards to the opening '{' of the wrapping object
  let start = -1;
  for (let i = anchorIdx; i >= 0; i--) {
    if (responseText[i] === '{') { start = i; break; }
  }
  if (start === -1) return null;
  // Walk forwards, tracking brace depth, skipping strings.
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < responseText.length; i++) {
    const ch = responseText[i];
    if (escape) { escape = false; continue; }
    if (ch === '\\') { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
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
  return signals.filter((s) => {
    if (!VALID_SIGNAL_TYPES.has(s.signal_type)) return false;
    if (!VALID_EVIDENCE_TYPES.has(s.evidence_type)) {
      s.evidence_type = 'observational_reported_fact';
    }
    if (INDIVIDUAL_EMOTIONAL_SIGNAL_TYPES.has(s.signal_type) &&
        s.evidence_type === 'observational_reported_fact') {
      return false;
    }
    return true;
  });
}

function normalizeStructured(raw) {
  const out = EMPTY_STRUCTURED();
  if (!raw || typeof raw !== 'object') return out;

  if (raw.observation && typeof raw.observation === 'object') {
    const o = raw.observation;
    out.observation.locality = typeof o.locality === 'string' && o.locality.trim() ? o.locality.trim() : null;
    out.observation.timeframe = typeof o.timeframe === 'string' && o.timeframe.trim() ? o.timeframe.trim() : null;
    out.observation.behavior = typeof o.behavior === 'string' && o.behavior.trim() ? o.behavior.trim() : null;
    out.observation.affectedPopulation = typeof o.affectedPopulation === 'string' && o.affectedPopulation.trim()
      ? o.affectedPopulation.trim() : null;
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
  out.missing = Array.isArray(raw.missing)
    ? raw.missing.filter((x) => typeof x === 'string').slice(0, 6)
    : [];
  out.missingByComponent = Array.isArray(raw.missingByComponent)
    ? raw.missingByComponent
        .filter((m) => m && VALID_COMPONENT_IDS.has(m.componentId))
        .map((m) => ({
          componentId: m.componentId,
          requiredFields: Array.isArray(m.requiredFields)
            ? m.requiredFields.filter((x) => typeof x === 'string').slice(0, 8) : [],
          disambiguation: Array.isArray(m.disambiguation)
            ? m.disambiguation.filter((x) => typeof x === 'string').slice(0, 4) : [],
        }))
        .slice(0, 6)
    : [];
  out.topQuestions = Array.isArray(raw.topQuestions)
    ? raw.topQuestions
        .filter((q) => typeof q === 'string' && q.trim())
        .map((q) => q.trim().slice(0, 220))
        .slice(0, 3)
    : [];

  return out;
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

function inferTimeframeFromText(text) {
  const t = String(text ?? '').toLowerCase();
  if (!t) return null;
  // Hebrew + English coarse cues only; keep simple so we don’t hallucinate precision.
  if (/(היום|מהבוקר|הבוקר|בבוקר|הערב|בלילה|כרגע|עכשיו)/.test(t)) return 'היום';
  if (/(אתמול|אמש)/.test(t)) return 'אתמול';
  if (/(שלשום)/.test(t)) return 'שלשום';
  if (/\b(today|this morning|tonight|right now|currently)\b/.test(t)) return 'today';
  if (/\b(yesterday|last night)\b/.test(t)) return 'yesterday';
  return null;
}

function postNormalizeStructured(structured, rawText) {
  const out = structured && typeof structured === 'object' ? structured : EMPTY_STRUCTURED();
  const obs = out.observation && typeof out.observation === 'object' ? out.observation : {};

  const modelLocality = normalizeLocalityName(obs.locality);
  const inferred = inferLocalityFromText(rawText);
  if (modelLocality) {
    obs.locality = modelLocality;
  } else {
    obs.locality = null;
    obs.localityHint = inferred ?? obs.localityHint ?? null;
  }

  obs.timeframe =
    (typeof obs.timeframe === 'string' && obs.timeframe.trim() ? obs.timeframe.trim().slice(0, 80) : null) ??
    inferTimeframeFromText(rawText);

  out.observation = obs;
  return out;
}

// ── Public factory ─────────────────────────────────────────────────────────

/**
 * @param {{ anthropicApiKey: string, geoEnrichmentPort?: { resolveLocalityName: (raw: string|null|undefined) => object } }} deps
 */
export function createWhatsAppResilienceAnalyzer({ anthropicApiKey, geoEnrichmentPort }) {
  const geoPort = geoEnrichmentPort ?? createNoOpGeoEnrichmentPort();
  const client = new Anthropic({ apiKey: anthropicApiKey });
  const realtimeSystemPrompt = buildSignalExtractionSystemPrompt('whatsapp_realtime');
  const interactiveSystemPrompt = buildSignalExtractionSystemPrompt('whatsapp_interactive');

  async function callModel({ system, userContent, maxTokens }) {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: maxTokens,
      temperature: 0,
      system,
      messages: [{ role: 'user', content: userContent }],
    });
    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock ? textBlock.text : '';
  }

  function parseCommonOutput(responseText) {
    // Parse the signal array (may or may not contain _assessment items)
    let rawArray;
    try {
      rawArray = extractJsonArray(responseText);
    } catch {
      return { signals: [], inlineAssessment: null, inlineStructured: null };
    }

    let inlineAssessment = null;
    let inlineStructured = null;
    const signals = [];

    for (const item of (Array.isArray(rawArray) ? rawArray : [rawArray])) {
      if (item && typeof item === 'object') {
        if (item._assessment) { inlineAssessment = item._assessment; continue; }
        if (item._structured) { inlineStructured = item._structured; continue; }
        signals.push(item);
      }
    }
    return { signals, inlineAssessment, inlineStructured };
  }

  return {
    /**
     * Analyze a single WhatsApp message (group flow — single-shot).
     * Matches the pre-existing contract so group replies keep working.
     */
    async analyzeMessage(messageText, senderName, opts = {}) {
      const sourceType = opts.sourceType ?? 'whatsapp';
      const isFieldReserve = sourceType === 'field_whatsapp';
      const userContent =
        `Extract all behavioral signals from this WhatsApp field report:\n\n` +
        `[1] WhatsApp message from ${senderName || 'field worker'}\n` +
        `${messageText}\n`;

      const responseText = await callModel({
        system: realtimeSystemPrompt,
        userContent,
        maxTokens: 2000,
      });
      if (!responseText) return { signals: [], assessment: { sufficient: false, missing: ['specific_details'] } };

      const { signals, inlineAssessment } = parseCommonOutput(responseText);
      const trailingAssessment = parseEmbeddedJsonObject(responseText, '_assessment');
      const rawAssessment = inlineAssessment ?? trailingAssessment ?? null;

      // Keep the legacy return shape for group flow back-compat.
      const assessment = rawAssessment
        ? {
            sufficient: !!rawAssessment.sufficient,
            missing: Array.isArray(rawAssessment.missing) ? rawAssessment.missing : [],
          }
        : { sufficient: false, missing: ['specific_details'] };

      // Realtime flow has no _structured output; still infer locality/timeframe heuristically for downstream UI.
      const structuredRaw = postNormalizeStructured(EMPTY_STRUCTURED(), messageText);
      const validated = validateSignals(signals);
      const grounded = applySourceNativeGrounding(validated, messageText, { source_type: sourceType });
      const { signals: sigGeo, structured } = attachGeoToSignalsAndStructured(grounded, structuredRaw, geoPort, {
        sourceType,
      });
      const withProvenance = isFieldReserve
        ? sigGeo.map((s) => enrichFieldProvenance(s, {
          officer_id: opts.officerId ?? null,
          visit_timestamp: opts.visitTimestamp ?? null,
        }))
        : sigGeo;
      return { signals: withProvenance, assessment, structured };
    },

    /**
     * Analyze the full multi-turn conversation so far (DM flow).
     * Uses the "whatsapp_interactive" prompt, which emits _structured + richer _assessment.
     *
     * @param {Array<{role:'officer'|'bot', text:string, ts?:string}>} turnHistory
     * @param {string} senderName
     */
    async analyzeTurnHistory(turnHistory, senderName) {
      if (!Array.isArray(turnHistory) || turnHistory.length === 0) {
        return {
          signals: [],
          structured: EMPTY_STRUCTURED(),
          assessment: DEFAULT_ASSESSMENT(),
        };
      }
      const userContent =
        `Analyze this ongoing WhatsApp dialogue with an Israeli field officer:\n\n` +
        `[1] ${formatTurnHistory(turnHistory, senderName)}\n`;

      const responseText = await callModel({
        system: interactiveSystemPrompt,
        userContent,
        maxTokens: 3000,
      });
      if (!responseText) {
        return {
          signals: [],
          structured: EMPTY_STRUCTURED(),
          assessment: DEFAULT_ASSESSMENT(),
        };
      }

      const { signals, inlineAssessment, inlineStructured } = parseCommonOutput(responseText);
      const trailingStructured = parseEmbeddedJsonObject(responseText, '_structured');
      const trailingAssessment = parseEmbeddedJsonObject(responseText, '_assessment');

      const structuredRaw = normalizeStructured(inlineStructured ?? trailingStructured);
      const assessment = normalizeAssessment(inlineAssessment ?? trailingAssessment);
      const lastOfficerText =
        [...turnHistory].reverse().find((t) => t.role !== 'bot' && typeof t.text === 'string')?.text ?? '';
      const officerSourceText = turnHistory
        .filter((t) => t.role !== 'bot' && typeof t.text === 'string')
        .map((t) => t.text.trim())
        .filter(Boolean)
        .join('\n');
      const structuredNorm = postNormalizeStructured(structuredRaw, lastOfficerText);
      const validated = validateSignals(signals);
      const grounded = applySourceNativeGrounding(validated, officerSourceText || lastOfficerText, {
        source_type: 'field_whatsapp',
      });
      const { signals: sigGeo, structured } = attachGeoToSignalsAndStructured(
        grounded,
        structuredNorm,
        geoPort,
        { sourceType: 'field_whatsapp' },
      );

      const lastTs = [...turnHistory].reverse().find((t) => t.role !== 'bot')?.ts ?? null;
      const withProvenance = sigGeo.map((s) => enrichFieldProvenance(s, {
        officer_id: senderName,
        visit_timestamp: lastTs,
        visit_locality: structuredNorm?.observation?.locality ?? structuredNorm?.observation?.localityHint ?? null,
        visit_locality_key: structuredNorm?.observation?.localityKey ?? null,
      }));

      return { signals: withProvenance, structured, assessment };
    },
  };
}
