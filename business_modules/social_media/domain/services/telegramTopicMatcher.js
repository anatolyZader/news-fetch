import { postMatchesTopic, topicMatchTokens } from './topicMatcher.js';

/**
 * @param {string} tok
 * @param {string} termLower
 * @param {string} textHay
 */
function tokenOverlapsTerm(tok, termLower, textHay) {
  const t = tok.toLowerCase();
  return textHay.includes(t) || termLower.includes(t) || t.includes(termLower);
}

/**
 * @param {string} textHay
 * @param {string[]} tokens
 * @param {import('./telegramChannelRegistry.js').TelegramChannelEntry} channel
 */
function matchesExampleSearchTerm(textHay, tokens, channel) {
  for (const term of channel.exampleSearchTerms ?? []) {
    const termLower = String(term).toLowerCase().trim();
    if (termLower.length < 2 || !textHay.includes(termLower)) continue;
    if (tokens.some((tok) => tokenOverlapsTerm(tok, termLower, textHay))) return true;
  }
  return false;
}

/**
 * @param {string} textHay
 * @param {string[]} tokens
 * @param {import('./telegramChannelRegistry.js').TelegramChannelEntry} channel
 */
function matchesCoverageArea(textHay, tokens, channel) {
  for (const area of channel.coverageArea ?? []) {
    const areaLower = String(area).toLowerCase().trim();
    if (areaLower.length < 2) continue;
    const topicMentionsArea = tokens.some(
      (tok) => areaLower.includes(tok.toLowerCase()) || tok.toLowerCase().includes(areaLower),
    );
    if (!topicMentionsArea) continue;
    if (tokens.some((tok) => textHay.includes(tok.toLowerCase()))) return true;
    if (textHay.includes(areaLower)) return true;
  }
  return false;
}

/**
 * Broader topic match for Telegram: standard topic tokens plus channel-specific
 * example_search_terms and coverage_area overlap. Applied before homefrontBehaviorFilter.
 *
 * @param {object} post
 * @param {string} topic
 * @param {import('./telegramChannelRegistry.js').TelegramChannelEntry} channel
 */
export function telegramPostMatchesTopic(post, topic, channel) {
  if (postMatchesTopic(post, topic)) return true;

  const tokens = topicMatchTokens(topic);
  if (!tokens.length) return true;

  const textHay = String(post.text ?? '').toLowerCase();
  if (!textHay) return false;

  return matchesExampleSearchTerm(textHay, tokens, channel)
    || matchesCoverageArea(textHay, tokens, channel);
}
