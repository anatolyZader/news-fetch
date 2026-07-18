/**
 * Bundled harm/infrastructure clause splitting: peel building-damage facts out of casualty signals.
 */
import { canonicalizeSignalType } from '../../contracts/signalCatalog.js';

/**
 * True if any of the given patterns matches. Splitting a wide alternation into
 * several smaller regexes keeps each one's regex-complexity within lint limits
 * while preserving the original "matches any alternative" semantics.
 * @param {RegExp[]} patterns
 * @param {string} text
 * @returns {boolean}
 */
export function testAny(patterns, text) {
  return patterns.some((re) => re.test(text));
}

/** Clause describes civilian physical injury, not building damage. */
const POPULATION_HARM_CLAUSE_PATTERNS = [
  /בני\s+אדם/i,
  /אנשים/i,
  /תינוק(?:ות)?/i,
  /ילד(?:ה|ים)\s+נפצע/i,
  /נפגעים/i,
  /נפצעו/i,
  /פצועים/i,
  /הרוג/i,
  /נפגע\s+בגוף/i,
  /injured/i,
  /wounded/i,
  /killed/i,
  /casualties/i,
];

/** Clause describes physical damage to structures or infrastructure ("<subject> ... <damage verb>"). */
const INFRA_DAMAGE_SUBJECT_VERB_PATTERNS = [
  /גן(?:י)?(?:\s+ילדים)?.{0,80}?(?:ניזוק|נפגע(?:ו)?|נהרס|destroyed|damaged|hit)/i,
  /(?:בתי\s+ספר|בית\s+ספר).{0,80}?(?:ניזוק|נפגע(?:ו)?|נהרס|destroyed|damaged|hit)/i,
  /(?:מבנה|בניין|דיר(?:ה|ות)).{0,80}?(?:ניזוק|נפגע(?:ו)?|נהרס|destroyed|damaged|hit)/i,
  /(?:תשתית|כביש|חשמל|מפעל).{0,80}?(?:ניזוק|נפגע(?:ו)?|נהרס|destroyed|damaged|hit)/i,
  /(?:kindergarten|school|building|infrastructure).{0,80}?(?:ניזוק|נפגע(?:ו)?|נהרס|destroyed|damaged|hit)/i,
];
const INFRA_DAMAGE_CLAUSE_PATTERNS = [
  ...INFRA_DAMAGE_SUBJECT_VERB_PATTERNS,
  /(?:ניזוק|נזק\s+(?:כבד\s+)?נגרם).{0,50}?(?:גן|בית\s+ספר|מבנה|בניין|דירה)/i,
];

/** Clause boundaries: sentence-ending punctuation, a comma before a new damage subject, semicolons, or a "במקביל" (in parallel) connector. */
const CLAUSE_BOUNDARY_SOURCES = [
  /(?<=[.!?])\s+/u,
  /\s*,\s+(?=גן\s|בית\s+ספר|בתי\s+ספר|מבנה|בניין)/u,
  /\s*;\s+/u,
  /\s+במקביל[,،]?\s+/u,
].map((re) => re.source);
const CLAUSE_SPLIT_RE = new RegExp(CLAUSE_BOUNDARY_SOURCES.join('|'), 'u');

/**
 * @param {string} evidence
 * @returns {string[]}
 */
export function splitEvidenceClauses(evidence) {
  const text = String(evidence ?? '').trim();
  if (!text) return [];
  const parts = text
    .split(CLAUSE_SPLIT_RE)
    .map((s) => s.replace(/^במקביל[,،]?\s*/u, '').trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
}

/**
 * @param {string} clause
 * @returns {'harm_to_population' | 'infrastructure_damage_acute' | null}
 */
export function classifyHarmInfrastructureClause(clause) {
  const text = String(clause ?? '').trim();
  if (!text) return null;
  const hasInfra = testAny(INFRA_DAMAGE_CLAUSE_PATTERNS, text);
  const hasHarm = testAny(POPULATION_HARM_CLAUSE_PATTERNS, text);
  if (hasInfra && !hasHarm) return 'infrastructure_damage_acute';
  if (hasHarm) return 'harm_to_population';
  return null;
}

/**
 * Split bundled harm + infrastructure facts into separate signals.
 * @param {object} signal
 * @returns {object[]}
 */
export function splitBundledHarmInfrastructure(signal) {
  if (!signal || typeof signal !== 'object') return [];
  const prevType = canonicalizeSignalType(signal.signal_type ?? signal.type);
  if (prevType !== 'harm_to_population' && prevType !== 'infrastructure_damage_acute') {
    return [signal];
  }

  const clauses = splitEvidenceClauses(signal.evidence);
  const harmClauses = [];
  const infraClauses = [];
  for (const clause of clauses) {
    const kind = classifyHarmInfrastructureClause(clause);
    if (kind === 'harm_to_population') harmClauses.push(clause);
    else if (kind === 'infrastructure_damage_acute') infraClauses.push(clause);
  }

  if (infraClauses.length === 0) return [signal];
  if (harmClauses.length === 0) {
    return [{
      ...signal,
      evidence: infraClauses.join('. '),
      signal_type: 'infrastructure_damage_acute',
      type: 'infrastructure_damage_acute',
    }];
  }

  const out = [{
    ...signal,
    evidence: harmClauses.join('. '),
    signal_type: 'harm_to_population',
    type: 'harm_to_population',
  }];
  out.push({
    ...signal,
    evidence: infraClauses.join('. '),
    signal_type: 'infrastructure_damage_acute',
    type: 'infrastructure_damage_acute',
  });
  return out;
}
