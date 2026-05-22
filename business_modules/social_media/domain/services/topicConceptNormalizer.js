const STOP_WORDS = new Set([
  'a', 'an', 'the', 'to', 'in', 'on', 'at', 'of', 'for', 'and', 'or', 'is', 'was', 'are',
  'be', 'by', 'with', 'from', 'as', 'it', 'its', 'that', 'this', 's',
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
 * Cross-lingual concept clusters for social topic search.
 * English (or mixed) UI input is expanded to Hebrew/Arabic/English variants
 * so matching and X/Telegram queries are not script-bound.
 */
export const TOPIC_CONCEPT_CLUSTERS = Object.freeze([
  {
    id: 'uav_drone',
    role: 'subject',
    triggers: /uav|drone|drones|כטב|רחפן|fpv|unmanned|uas\b/i,
    terms: {
      he: ['כטב"מ', 'כטבם', 'רחפן', 'רחפנים', 'חדירת כלי טיס', 'FPV'],
      en: ['UAV', 'drone', 'drones'],
      ar: ['مسيرة', 'طائرة مسيرة'],
    },
  },
  {
    id: 'danger_threat',
    role: 'modifier',
    triggers: /danger|threat|risks?|fear|scared|terrified|איום|סכנ|פחד|מפחיד/i,
    terms: {
      he: ['סכנה', 'איום', 'פחד', 'חשש', 'מסוכן', 'מפחיד'],
      en: ['danger', 'threat', 'risk', 'fear'],
      ar: ['خطر', 'تهديد', 'خوف'],
    },
  },
  {
    id: 'shelter',
    role: 'subject',
    triggers: /shelter|מקלט|ממ"ד|ממ״ד|מרחב מוגן/i,
    terms: {
      he: ['מקלט', 'ממ"ד', 'מרחב מוגן', 'מקלטים'],
      en: ['shelter', 'safe room'],
      ar: ['ملجأ', 'غرفة آمنة'],
    },
  },
  {
    id: 'siren_alert',
    role: 'subject',
    triggers: /siren|sirens|alert|alerts|אזעק/i,
    terms: {
      he: ['אזעקה', 'אזעקות'],
      en: ['siren', 'sirens', 'alert'],
      ar: ['صفارة', 'إنذار'],
    },
  },
  {
    id: 'evacuation',
    role: 'subject',
    triggers: /evacuat|displaced|פינוי|מפונ/i,
    terms: {
      he: ['פינוי', 'מפונים', 'פינו'],
      en: ['evacuation', 'evacuees', 'displaced'],
      ar: ['إخلاء', 'نازحون'],
    },
  },
  {
    id: 'ben_gvir',
    role: 'subject',
    triggers: /ben\s*[- ]?\s*gvir|בן\s*גביר/i,
    terms: {
      he: ['"בן גביר"', 'בן-גביר'],
      en: ['"ben gvir"', 'BenGvir'],
      ar: ['بن غvir'],
    },
  },
  {
    id: 'port',
    role: 'subject',
    triggers: /\bport\b|נמל/i,
    terms: {
      he: ['נמל', 'הנמל'],
      en: ['port'],
      ar: ['ميناء'],
    },
  },
]);

/** @type {Record<string, { he: string, en: string, ar: string }>} */
export const TOPIC_PLACE_NAMES = Object.freeze({
  ashdod: { he: 'אשדוד', en: 'Ashdod', ar: 'أشدود' },
  haifa: { he: 'חיפה', en: 'Haifa', ar: 'حيفا' },
  nahariya: { he: 'נהריה', en: 'Nahariya', ar: 'نهاريا' },
  'kiryat shmona': { he: 'קריית שמונה', en: 'Kiryat Shmona', ar: 'كريات شmونة' },
  'tel aviv': { he: 'תל אביב', en: 'Tel Aviv', ar: 'تل أبيب' },
  jerusalem: { he: 'ירושלים', en: 'Jerusalem', ar: 'القدس' },
  akko: { he: 'עכו', en: 'Acre', ar: 'عكا' },
  acre: { he: 'עכו', en: 'Acre', ar: 'عكا' },
});

function addPlaceTerms(topic, terms, conceptIds) {
  const lower = String(topic ?? '').toLowerCase();
  for (const [key, names] of Object.entries(TOPIC_PLACE_NAMES)) {
    if (!lower.includes(key)) continue;
    conceptIds.push(`place:${key}`);
    for (const name of Object.values(names)) {
      terms.add(name);
      terms.add(name.toLowerCase());
    }
  }
}

function addClusterTerms(topic, terms, conceptIds) {
  for (const cluster of TOPIC_CONCEPT_CLUSTERS) {
    if (!cluster.triggers.test(topic)) continue;
    conceptIds.push(cluster.id);
    for (const langTerms of Object.values(cluster.terms)) {
      for (const term of langTerms) {
        terms.add(term);
        terms.add(term.toLowerCase().replace(/"/g, ''));
      }
    }
  }
}

/**
 * @param {string} topic Raw UI / CLI input
 * @returns {{
 *   original: string,
 *   conceptIds: string[],
 *   matchTokens: string[],
 *   searchTermsByLang: { he: string[], en: string[], ar: string[] },
 * }}
 */
export function normalizeTopicConcept(topic) {
  const original = String(topic ?? '').trim();
  const terms = new Set();
  const conceptIds = [];

  for (const token of meaningfulTopicTokens(original)) {
    terms.add(token);
  }

  addClusterTerms(original, terms, conceptIds);
  addPlaceTerms(original, terms, conceptIds);

  /** @type {{ he: string[], en: string[], ar: string[] }} */
  const searchTermsByLang = { he: [], en: [], ar: [] };

  for (const cluster of TOPIC_CONCEPT_CLUSTERS) {
    if (!cluster.triggers.test(original)) continue;
    for (const lang of ['he', 'en', 'ar']) {
      for (const term of cluster.terms[lang] ?? []) {
        if (!searchTermsByLang[lang].includes(term)) searchTermsByLang[lang].push(term);
      }
    }
  }

  for (const [key, names] of Object.entries(TOPIC_PLACE_NAMES)) {
    if (!original.toLowerCase().includes(key)) continue;
    for (const lang of ['he', 'en', 'ar']) {
      const name = names[lang];
      if (name && !searchTermsByLang[lang].includes(name)) searchTermsByLang[lang].push(name);
    }
  }

  if (!conceptIds.length && original) {
    searchTermsByLang.en.push(`"${original}"`);
  }

  const matchTokens = [...new Set(
    [...terms].map((t) => String(t).toLowerCase().replace(/"/g, '')),
  )].filter(Boolean);

  return {
    original,
    conceptIds,
    matchTokens,
    searchTermsByLang,
  };
}

/**
 * @param {string} topic
 * @param {string} lang
 */
export function conceptSearchTermsForLang(topic, lang) {
  const normalized = normalizeTopicConcept(topic);
  const fromLang = normalized.searchTermsByLang[lang] ?? [];
  if (fromLang.length) return fromLang.slice(0, 8);

  if (lang === 'en') {
    return [`"${normalized.original}"`, ...normalized.matchTokens.filter((t) => /^[\x00-\x7F]+$/.test(t))].slice(0, 8);
  }

  return normalized.matchTokens.slice(0, 8);
}

/** @param {string} conceptId */
export function isSubjectConceptId(conceptId) {
  if (String(conceptId).startsWith('place:')) return true;
  const cluster = TOPIC_CONCEPT_CLUSTERS.find((c) => c.id === conceptId);
  return cluster?.role === 'subject';
}

/**
 * @param {string} conceptId
 * @param {string} [topic]
 * @returns {string[]}
 */
export function tokensForConceptId(conceptId, topic = '') {
  if (conceptId.startsWith('place:')) {
    const key = conceptId.slice('place:'.length);
    const names = TOPIC_PLACE_NAMES[key];
    if (!names) return [];
    return [...new Set(Object.values(names).flatMap((name) => [name, name.toLowerCase()]))];
  }

  const cluster = TOPIC_CONCEPT_CLUSTERS.find((c) => c.id === conceptId);
  if (!cluster) return [];

  const terms = new Set();
  for (const langTerms of Object.values(cluster.terms)) {
    for (const term of langTerms) {
      terms.add(String(term).toLowerCase().replace(/"/g, ''));
    }
  }
  for (const token of meaningfulTopicTokens(topic)) {
    if (cluster.triggers.test(token)) terms.add(token);
  }
  return [...terms].filter(Boolean);
}
