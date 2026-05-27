import {
  normalizeTopicConcept,
  TOPIC_PLACE_NAMES,
  isSubjectConceptId,
  tokensForConceptId,
} from './topicConceptNormalizer.js';

export {
  normalizeTopicConcept,
  meaningfulTopicTokens,
  TOPIC_PLACE_NAMES as TOPIC_PLACES,
} from './topicConceptNormalizer.js';

/**
 * @param {string} topic
 */
export function topicMatchTokens(topic) {
  return normalizeTopicConcept(topic).matchTokens;
}

/**
 * @param {string} topic
 * @param {string} lang
 */
export function detectTopicPlaceClause(topic, lang) {
  const lower = String(topic ?? '').toLowerCase();
  for (const [key, names] of Object.entries(TOPIC_PLACE_NAMES)) {
    if (lower.includes(key)) {
      const label = names[lang] ?? names.en;
      return `(${label} OR ${names.en})`;
    }
  }
  return null;
}

/**
 * @param {string} topic
 */
export function expandTopicAliases(topic) {
  const normalized = normalizeTopicConcept(topic);
  const out = new Set();
  for (const terms of Object.values(normalized.searchTermsByLang)) {
    for (const term of terms) out.add(term);
  }
  return [...out];
}

/**
 * @param {object} post
 */
function postHaystack(post) {
  return [
    post.text,
    post.behaviorOrEmotion,
    post.location,
    post.authorRole,
  ].join(' ').toLowerCase();
}

/**
 * @param {string} hay
 * @param {string[]} tokens
 */
function hayIncludesAnyToken(hay, tokens) {
  return tokens.some((tok) => {
    const t = String(tok).toLowerCase().replaceAll('"', '');
    return t.length >= 2 && hay.includes(t);
  });
}

/**
 * When the topic activates subject concepts (UAV, shelter, place, …), at least one
 * subject term must match. Modifier-only hits (e.g. "חשש" for "uav danger") are not enough.
 *
 * @param {object} post
 * @param {string} topic
 */
export function postMatchesTopic(post, topic) {
  const normalized = normalizeTopicConcept(topic);
  const hay = postHaystack(post);
  const subjectIds = normalized.conceptIds.filter((id) => isSubjectConceptId(id));

  if (subjectIds.length > 0) {
    return subjectIds.some((id) => hayIncludesAnyToken(hay, tokensForConceptId(id, topic)));
  }

  if (!normalized.matchTokens.length) return true;
  return hayIncludesAnyToken(hay, normalized.matchTokens);
}
