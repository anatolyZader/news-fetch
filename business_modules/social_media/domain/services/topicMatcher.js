const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'in', 'on', 'at', 'of', 'for', 'and', 'or', 'is', 'was', 'are',
  'be', 'by', 'with', 'from', 'as', 'it', 'its', 'that', 'this', 's',
]);

/** Cities/places mentioned in topics — override default north-locality filter. */
const TOPIC_PLACES = Object.freeze({
  ashdod: { he: 'אשדוד', en: 'Ashdod', ar: 'أشدود' },
  haifa: { he: 'חיפה', en: 'Haifa', ar: 'حيفا' },
  nahariya: { he: 'נהריה', en: 'Nahariya', ar: 'نهاريا' },
  'kiryat shmona': { he: 'קריית שמונה', en: 'Kiryat Shmona', ar: 'كريات شمونة' },
  'tel aviv': { he: 'תל אביב', en: 'Tel Aviv', ar: 'تل أبيب' },
  jerusalem: { he: 'ירושלים', en: 'Jerusalem', ar: 'القدس' },
  akko: { he: 'עכו', en: 'Acre', ar: 'عكا' },
  acre: { he: 'עכו', en: 'Acre', ar: 'عكا' },
});

/** English/multi-lingual topic aliases for X query expansion. */
const TOPIC_ALIASES = Object.freeze([
  { re: /ben\s*[- ]?\s*gvir|בן\s*גביר/i, terms: ['"בן גביר"', 'בן-גביר', '"ben gvir"', 'BenGvir'] },
  { re: /uav|drone|כטב"מ|רחפן/i, terms: ['כטב"מ', 'רחפן', 'drone', 'UAV', 'כטבם'] },
  { re: /shelter|מקלט|ממ"ד/i, terms: ['מקלט', 'ממ"ד', 'מרחב מוגן', 'shelter'] },
  { re: /siren|אזעק/i, terms: ['אזעקה', 'אזעקות', 'siren', 'sirens'] },
  { re: /port|נמל/i, terms: ['נמל', 'port', 'הנמל'] },
]);

/**
 * @param {string} topic
 */
export function meaningfulTopicTokens(topic) {
  return String(topic ?? '')
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/^['"']|['"']$/g, '').replace(/['']s$/i, ''))
    .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * @param {string} topic
 */
export function topicMatchTokens(topic) {
  const tokens = meaningfulTopicTokens(topic);
  for (const { re, terms } of TOPIC_ALIASES) {
    if (re.test(topic)) {
      for (const term of terms) {
        tokens.push(term.toLowerCase().replace(/"/g, ''));
      }
    }
  }
  return [...new Set(tokens)];
}

/**
 * @param {string} topic
 * @param {string} lang
 */
export function detectTopicPlaceClause(topic, lang) {
  const lower = String(topic ?? '').toLowerCase();
  for (const [key, names] of Object.entries(TOPIC_PLACES)) {
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
  const out = new Set();
  for (const { re, terms } of TOPIC_ALIASES) {
    if (re.test(topic)) {
      for (const term of terms) out.add(term);
    }
  }
  return [...out];
}

/**
 * @param {object} post
 * @param {string} topic
 */
export function postMatchesTopic(post, topic) {
  const tokens = topicMatchTokens(topic);
  if (!tokens.length) return true;
  const hay = [
    post.text,
    post.behaviorOrEmotion,
    post.location,
    post.authorRole,
  ].join(' ').toLowerCase();
  return tokens.some((tok) => hay.includes(tok.toLowerCase()));
}
