/**
 * Rule-based chat system-context tiering (no extra LLM call).
 */
import { COMPONENT_IDS } from '../../../cross-cut-modules/resilience-contracts/componentIds.js';
import { chatCompactToolLoopEnabled } from '../../../cross-cut-modules/agent/agentConfig.js';

/** @typedef {'full'|'compare'|'hub'|'minimal'|'component'|'standard'} ChatContextTier */

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
  information_communication: ['information communication', 'information', 'communication', 'מידע', 'תקשורת'],
  lifesaving_behavior: ['lifesaving', 'lifesaving behavior', 'shelter behavior', 'מקלט', 'הצלת חיים'],
  functional_continuity: ['functional continuity', 'continuity', 'functional_continuity', 'רציפות'],
  community_capital: ['community capital', 'community', 'קהילה', 'הון קהילתי'],
  leadership: ['leadership', 'מנהיגות'],
  belonging_solidarity: ['belonging', 'solidarity', 'belonging solidarity', 'שיוך', 'סולידריות'],
  wellbeing_at_risk: ['wellbeing', 'well-being', 'wellbeing at risk', 'רווחה'],
};

export function chatContextTieringEnabled() {
  const v = process.env.CHAT_CONTEXT_TIERING;
  return v !== '0' && v !== 'false';
}

/**
 * @param {string} message
 * @param {{ toolProfile?: string, forceFull?: boolean }} [opts]
 * @returns {{ tier: ChatContextTier, componentId?: string, reason: string }}
 */
export function resolveChatContextTier(message, opts = {}) {
  if (opts.forceFull) {
    return { tier: 'full', reason: 'economy_full_override' };
  }

  const text = String(message ?? '').trim();
  const lower = text.toLowerCase();

  if (FULL_PATTERNS.some((re) => re.test(text))) {
    return { tier: 'full', reason: 'explicit_full_request' };
  }

  if (COMPARE_PATTERNS.some((re) => re.test(text))) {
    return { tier: 'compare', reason: 'compare_or_drift' };
  }

  if (HUB_PATTERNS.some((re) => re.test(text))) {
    return { tier: 'hub', reason: 'hub_or_priority' };
  }

  if (opts.toolProfile === 'validation') {
    return { tier: 'minimal', reason: 'validation_profile' };
  }

  if (MINIMAL_PATTERNS.some((re) => re.test(text))) {
    return { tier: 'minimal', reason: 'evidence_or_source' };
  }

  for (const id of COMPONENT_IDS) {
    const idSpaced = id.replaceAll('_', ' ');
    if (lower.includes(id) || lower.includes(idSpaced)) {
      return { tier: 'component', componentId: id, reason: 'component_id_match' };
    }
    const aliases = COMPONENT_ALIASES[id] ?? [];
    for (const alias of aliases) {
      if (lower.includes(alias.toLowerCase())) {
        return { tier: 'component', componentId: id, reason: `component_alias:${alias}` };
      }
    }
  }

  return { tier: 'standard', reason: 'default' };
}

/**
 * @param {string} _message
 * @param {{ economy?: string, toolProfile?: string }} [opts]
 */
export function resolveChatEconomyMode(_message, opts = {}) {
  const override = String(opts.economy ?? 'default').trim().toLowerCase();
  const tieringEnabled = chatContextTieringEnabled() && override !== 'full';
  const forceFull = override === 'full';
  const compactToolLoop = forceFull
    ? false
    : chatCompactToolLoopEnabled();

  return {
    economyOverride: override === 'full' ? 'full' : 'default',
    tieringEnabled,
    forceFull,
    compactToolLoop,
  };
}
