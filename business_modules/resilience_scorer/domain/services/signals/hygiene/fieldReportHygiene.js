/**
 * Post-extract cleanup for PBO and field-report signals.
 *
 * Pipeline position: extract/assess — hygiene pass before verification and scope filtering.
 *
 * Owns: trivial-evidence drop, channel-inventory drop, officer score-blob stripping,
 * misclassified type rewrite on field reports.
 * Does NOT: catalogue routing (signalTypeHygiene.js owns rewrite rules), or gaming/grounding policy.
 *
 * Key collaborators: signalTypeHygiene.js, ../fieldSignalPolicy.js, ../visitsSourceType.js, harmInfrastructureSplit.js.
 */
import { isExpectedHolidayClosureSignal, rewriteMisclassifiedSignalType } from './signalTypeHygiene.js';

const TRIVIAL_FIELD_REPORT_EVIDENCE_RE = /^(אין|אין שינוי|ללא שינוי|ללא שינויים|ללא חריג|אין חריג|אין מה לדווח|לל["״׳']?ש|אותו דבר|אותו הדבר|לא רלוונטי|none|no change|n\/a|—|-|\.)$/i;

/** Why a field-report signal was dropped; surfaced in load/extract drop accounting. */
export const FIELD_REPORT_DROP_REASON = Object.freeze({
  boilerplate: 'boilerplate',
  holiday_closure: 'holiday_closure',
  channel_inventory: 'channel_inventory',
});

const AVG_SCORE_BLOB_RE = /\[([^\]]+)\]\s*[^:]+:\s*avg=\d+%(?:\s*\([^)]*\))?\s*(?:—\s*)?/gi;

/** Keep the municipality prefix — it is locality information; only the officer score blob is noise. */
const AVG_SCORE_BLOB_REPLACEMENT = '[$1] ';

/**
 * Whether field-report evidence text is too short or boilerplate to retain as a signal.
 *
 * @param {string|null|undefined} text
 * @returns {boolean}
 */
export function isTrivialFieldReportEvidence(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return true;
  if (trimmed.length < 3) return true;
  if (TRIVIAL_FIELD_REPORT_EVIDENCE_RE.test(trimmed)) return true;
  const afterMuni = trimmed.replace(/^\[[^\]]+\]\s*/, '').trim();
  if (TRIVIAL_FIELD_REPORT_EVIDENCE_RE.test(afterMuni)) return true;
  return false;
}

/**
 * Strip officer score-summary blobs from evidence; return substantive remainder.
 *
 * @param {string} evidence raw evidence text
 * @returns {string} cleaned evidence string
 */
export function stripFieldReportScoreBlob(evidence) {
  let out = String(evidence ?? '');
  out = out.replaceAll(AVG_SCORE_BLOB_RE, AVG_SCORE_BLOB_REPLACEMENT);
  out = out.replaceAll(/\bavg=\d+%(?:\s*\([^)]*\))?/gi, '');
  return out.replaceAll(/\s+/g, ' ').trim();
}

/**
 * Channel and actor nouns that a municipal "how do you inform residents" answer
 * lists without asserting anything. Concept-level regexes, not exact strings:
 * the corpus is hand-typed and misspells most of these (ווטצאפ / מעוצה / ערייה).
 * Anything not listed here leaves residue and keeps the signal — omission is the
 * fail-open direction, so an unfamiliar token can never cause a drop.
 */
const CHANNEL_INVENTORY_TOKEN_RES = [
  // channels
  /^ו?ו?[אה]?טס?[- ]?אפ$/, /^הו?ו?אטסאפ$/, /^ווטצאפ$/, /^וואטסאפ$/, /^ווטסאפ$/, /^הוואטסאף$/, /^וואטסאף$/, /^ווטסאף$/,
  /^פי?יסבוק$/, /^הפי?יסבוק$/,
  /^רשת(ות)?$/, /^חברתי(ת|ים|ות)?$/, /^מדיה$/, /^תקשורת$/, /^אמצעי(ם)?$/,
  /^רדיו$/, /^טל(ו)?ויזיה$/, /^אתר(ים)?$/, /^אינטרנט$/, /^דף$/, /^דפי$/,
  /^קבוצ(ה|ות)$/, /^כריזה$/, /^מסרון(ים)?$/, /^סמס$/, /^אפליקצי(ה|ות)$/,
  /^פלטפורמ(ה|ות)$/, /^ערוץ$/, /^ערוצים$/, /^עיתונות$/,
  // actors
  /^רשות(י)?$/, /^מו?עצה$/, /^ע(י)?ריי?ה$/, /^דובר(ות)?$/,
  /^פקע["״']?ר$/, /^פקער$/, /^פיקוד$/, /^העורף$/, /^מוקד$/,
  // fillers and modifiers that carry no assertion on their own
  /^מקומי(ת|ים|ות)?$/, /^ארצי(ת|ים|ות)?$/, /^נוסף$/, /^נוספ(ים|ות)$/,
  /^של$/, /^כן$/, /^גם$/,
];

/**
 * Markers that make a drop unsafe. A negation turns a channel list into a real
 * negative finding ("אין ווטסאפ רשותי" = no municipal WhatsApp), and an
 * adversative means a second clause is present. Deleting negative evidence is
 * the exact failure this module guards against, so these win unconditionally.
 */
const CHANNEL_KEEP_GUARD_RES = [
  /[0-9%]/,
  /(^|\s)(אין|אינו|אינם|אינה|חסר|חסרים|ללא|בלי|לא)(\s|$)/,
  /(^|\s)(מחסור|פער|פערים|אך|אבל|לצד|אולם|ברם)(\s|$)/,
  /עם זאת/,
];

/** Latin words that are channel names rather than substantive prose. */
const LATIN_CHANNEL_RE = /^(whatsapp|facebook|sms|radio|tv|web|site|app|telegram|instagram|youtube)$/i;

/** Leading conjunction/definite-article clitics that Hebrew fuses onto a noun. */
const HEBREW_CLITIC_RE = /^(וה|ו|ה)/;

/**
 * Whether evidence is a bare inventory of channels and actors with no predicate.
 *
 * A municipal answer to "how is information conveyed" that reads
 * "פקער,רשות,תקשורת" names the pipes and asserts nothing about reach, uptake,
 * clarity or gaps — but it still routes a primary + edge into both
 * information_communication and lifesaving_behavior. Verb-based rather than
 * length-based: the [municipality] prefix inflates length, and Hebrew is
 * unsegmented, so any predicate, quantifier or non-channel noun leaves residue
 * and keeps the signal.
 *
 * @param {string|null|undefined} text evidence text (municipality prefix included)
 * @returns {boolean} true when the text is a pure channel/actor list
 */
export function isChannelInventoryEvidence(text) {
  const stripped = String(text ?? '')
    .replaceAll(/\[[^\]]*\]/g, ' ')
    .trim();
  if (!stripped) return false;
  if (CHANNEL_KEEP_GUARD_RES.some((re) => re.test(stripped))) return false;

  const tokens = stripped
    .replaceAll(/[,.;:|/\-–—"״'׳()[\]]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return false;

  return tokens.every((token) => {
    if (LATIN_CHANNEL_RE.test(token)) return true;
    if (/[A-Za-z]{3}/.test(token)) return false;
    const bare = token.replace(HEBREW_CLITIC_RE, '');
    return CHANNEL_INVENTORY_TOKEN_RES.some((re) => re.test(token) || re.test(bare));
  });
}

/**
 * Sanitize one field-report signal, reporting why it was dropped.
 *
 * Rule order matters: the exact-match boilerplate and holiday rules run before
 * the channel gate so each drop is attributed to the most specific reason.
 *
 * @param {object} signal
 * @returns {{ signal: object|null, dropReason: string|null }}
 */
export function sanitizeFieldReportSignalDetailed(signal) {
  if (!signal || typeof signal !== 'object') return { signal: null, dropReason: null };

  const evidence = stripFieldReportScoreBlob(signal.evidence ?? '');
  const signalType = rewriteMisclassifiedSignalType(signal.signal_type ?? signal.type, evidence);

  if (isTrivialFieldReportEvidence(evidence)) {
    return { signal: null, dropReason: FIELD_REPORT_DROP_REASON.boilerplate };
  }
  if (isExpectedHolidayClosureSignal({ signal_type: signalType, evidence })) {
    return { signal: null, dropReason: FIELD_REPORT_DROP_REASON.holiday_closure };
  }
  if (isChannelInventoryEvidence(evidence)) {
    return { signal: null, dropReason: FIELD_REPORT_DROP_REASON.channel_inventory };
  }

  return {
    signal: {
      ...signal,
      signal_type: signalType,
      type: signalType,
      evidence,
    },
    dropReason: null,
  };
}

/**
 * Sanitize one field-report signal; returns null when evidence is trivial after cleanup.
 *
 * @param {object} signal
 * @returns {object|null} cleaned signal or null if dropped
 */
export function sanitizeFieldReportSignal(signal) {
  return sanitizeFieldReportSignalDetailed(signal).signal;
}

/**
 * Apply field-report hygiene to a signal array; drops signals that fail sanitization.
 *
 * @param {object[]} signals
 * @param {{ onDrop?: (reason: string, signal: object) => void }} [opts]
 * @returns {object[]} retained signals
 */
export function applyFieldReportSignalHygiene(signals, { onDrop } = {}) {
  if (!Array.isArray(signals)) return [];
  const out = [];
  for (const signal of signals) {
    const { signal: cleaned, dropReason } = sanitizeFieldReportSignalDetailed(signal);
    if (cleaned) {
      out.push(cleaned);
      continue;
    }
    if (dropReason && onDrop) onDrop(dropReason, signal);
  }
  return out;
}
