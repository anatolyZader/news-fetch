/**
 * Rule-based chat context_slice selection (no extra LLM call).
 * Env: CHAT_CONTEXT_TIERING (set 0 to disable — always full context).
 */
import { COMPONENT_IDS } from '../../resilience_scorer/index.js';
import { chatCompactToolLoopEnabled } from '../../../cross-cut-modules/agent/agentConfig.js';

/** @typedef {'full'|'compare'|'hub'|'minimal'|'component'|'standard'|'temporal'} ContextSlice */

const TEMPORAL_PATTERNS = [
  /\bthroughout\b/i,
  /\bover time\b/i,
  /\bfrom the beginning\b/i,
  /\ball dates\b/i,
  /\btimeline\b/i,
  /\bdevelop(?:ed|ment)?\b/i,
  /\bevolution\b/i,
  /\bbeginning to end\b/i,
  /\bnot just (two|2) dates?\b/i,
  /\bacross (all|the) dates?\b/i,
  /\bduring the war\b/i,
  /\bthroughout the war\b/i,
  /במהלך המלחמה/,
  /לאורך המלחמה/,
  /מתחילת/,
  /במהלך/,
  /התפתח/,
  /כל התאריכים/,
  /מתחילה ועד/,
];

const ANTI_COMPARE_PATTERNS = [
  /\ball dates\b/i,
  /\bthroughout\b/i,
  /\bnot just (two|2)\b/i,
  /\bbeginning to end\b/i,
  /\bacross (all|the) dates?\b/i,
  /\bover time\b/i,
  /\btimeline\b/i,
  /כל התאריכים/,
  /לאורך/,
  /מתחילה ועד/,
];

const FULL_PATTERNS = [
  /\ball components\b/i,
  /\bfull report\b/i,
  /\bentire report\b/i,
  /\bcomplete assessment\b/i,
  /\boverview of everything\b/i,
  /סכם הכל/,
  /כל הרכיבים/,
  /דוח מלא/,
];

const COMPARE_PATTERNS = [
  /\bwhat changed\b/i,
  /\bcompare\b/i,
  /\bdrift\b/i,
  /\bdifference between\b/i,
  /השוואה/,
  /מה השתנה/,
  /השתנה/,
];

const HUB_PATTERNS = [
  /\bfocus on\b/i,
  /\bpriorit(y|ies)\b/i,
  /\battention items?\b/i,
  /\bdecision brief\b/i,
  /\bwhat should i\b/i,
  /\boperational priorities\b/i,
  /דגש/,
  /עדיפות/,
  /עדיפויות/,
  /מה כדאי/,
  /תשומת לב/,
];

const MINIMAL_PATTERNS = [
  /\bsource_id\b/i,
  /\bsource id\b/i,
  /\bverbatim\b/i,
  /\bquote\b/i,
  /\bevidence\b/i,
  /\bsignal(s)?\b/i,
  /\barticle(s)?\b/i,
  /\bsearch_sources\b/i,
  /\bget_source\b/i,
  /מקור/,
  /ציטוט/,
  /מאמר/,
  /אות(?:ות)?/,
];

/** @type {Record<string, string[]>} */
const COMPONENT_ALIASES = {
  narrative: ['narrative', 'סיפור', 'narratives'],
  information_communication: ['information communication', 'information and communication', 'information', 'communication', 'מידע', 'תקשורת'],
  lifesaving_behavior: ['lifesaving', 'lifesaving behavior', 'shelter behavior', 'מקלט', 'הצלת חיים'],
  functional_continuity: ['functional continuity', 'continuity', 'functional_continuity', 'רציפות'],
  community_capital: ['community capital', 'community', 'קהילה', 'הון קהילתי'],
  leadership: ['leadership', 'מנהיגות'],
  belonging_solidarity: ['belonging', 'solidarity', 'belonging solidarity', 'שיוך', 'סולידריות'],
  wellbeing_at_risk: ['wellbeing', 'well-being', 'wellbeing at risk', 'רווחה'],
};

export function chatContextSlicingEnabled() {
  const v = process.env.CHAT_CONTEXT_TIERING;
  return v !== '0' && v !== 'false';
}

/** @deprecated Use chatContextSlicingEnabled */
export const chatContextTieringEnabled = chatContextSlicingEnabled;

/**
 * @param {string} text
 * @returns {{ componentId: string, reason: string }|null}
 */
export function resolveComponentIdFromMessage(text) {
  const lower = String(text ?? '').toLowerCase();
  for (const id of COMPONENT_IDS) {
    const idSpaced = id.replaceAll('_', ' ');
    if (lower.includes(id) || lower.includes(idSpaced)) {
      return { componentId: id, reason: 'component_id_match' };
    }
    const aliases = COMPONENT_ALIASES[id] ?? [];
    for (const alias of aliases) {
      if (lower.includes(alias.toLowerCase())) {
        return { componentId: id, reason: `component_alias:${alias}` };
      }
    }
  }
  return null;
}

function isAntiCompare(text) {
  return ANTI_COMPARE_PATTERNS.some((re) => re.test(text));
}

/**
 * @param {string} message
 * @param {{ toolProfile?: string, forceFull?: boolean }} [opts]
 * @returns {{ contextSlice: ContextSlice, componentId?: string, reason: string }}
 */
export function resolveChatContextTier(message, opts = {}) {
  if (opts.forceFull) {
    return { contextSlice: 'full', reason: 'economy_full_override' };
  }

  const text = String(message ?? '').trim();

  if (FULL_PATTERNS.some((re) => re.test(text))) {
    return { contextSlice: 'full', reason: 'explicit_full_request' };
  }

  if (TEMPORAL_PATTERNS.some((re) => re.test(text))) {
    const comp = resolveComponentIdFromMessage(text);
    return {
      contextSlice: 'temporal',
      componentId: comp?.componentId,
      reason: comp ? `temporal:${comp.reason}` : 'temporal_query',
    };
  }

  if (COMPARE_PATTERNS.some((re) => re.test(text)) && !isAntiCompare(text)) {
    return { contextSlice: 'compare', reason: 'compare_or_drift' };
  }

  if (HUB_PATTERNS.some((re) => re.test(text))) {
    return { contextSlice: 'hub', reason: 'hub_or_priority' };
  }

  if (opts.toolProfile === 'validation') {
    return { contextSlice: 'minimal', reason: 'validation_profile' };
  }

  if (MINIMAL_PATTERNS.some((re) => re.test(text))) {
    return { contextSlice: 'minimal', reason: 'evidence_or_source' };
  }

  const comp = resolveComponentIdFromMessage(text);
  if (comp) {
    return { contextSlice: 'component', componentId: comp.componentId, reason: comp.reason };
  }

  return { contextSlice: 'standard', reason: 'default' };
}

/**
 * @param {string} _message
 * @param {{ economy?: string, toolProfile?: string }} [opts]
 */
export function resolveChatEconomyMode(_message, opts = {}) {
  const override = String(opts.economy ?? 'default').trim().toLowerCase();
  const contextSlicingEnabled = chatContextSlicingEnabled() && override !== 'full';
  const forceFull = override === 'full';
  const compactToolLoop = forceFull
    ? false
    : chatCompactToolLoopEnabled();

  return {
    economyOverride: override === 'full' ? 'full' : 'default',
    contextSlicingEnabled,
    forceFull,
    compactToolLoop,
  };
}
