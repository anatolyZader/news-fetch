/**
 * Catalog-driven prompt fragments for closed-vocabulary extraction.
 *
 * Pipeline position: closed-catalogue extraction (Haiku / multipass). Renders
 * SIGNAL_CATALOG into prompt text: domain lists, disambiguation boundaries, and
 * mirror self-check hints used after a type is proposed.
 *
 * Owns: formatSignalCatalog*, formatDisambiguationBlock, mirror self-check helpers,
 * DISAMBIGUATION_PRIORITY_TYPES ordering for the stable prefix budget.
 * Does NOT: invent signal types or labels (source of truth is signalCatalog.js);
 * does not route types to components (signalRouting.js).
 *
 * Key collaborators: signalCatalog.js (via signalRouter), extractionPasses /
 * closedCatalogueExtractService (consumers), signalRouter.js.
 */

import { SIGNAL_CATALOG, getSignalCatalogEntry } from './signalRouter.js';

// --- Priority types for disambiguation block ---------------------------------

/**
 * Types with rich disambiguation metadata — emitted first in the boundaries block
 * so the hard-budgeted stable prefix spends chars on the highest-confusion pairs.
 * @type {string[]}
 */
export const DISAMBIGUATION_PRIORITY_TYPES = [
  'solidarity_help_others',
  'harm_to_population',
  'service_disruption',
  'economic_disruption',
  'resource_shortage',
  'fear_expression',
  'leadership_clear_guidance',
  'information_actionable_effective',
  'information_confusion',
  'political_distrust',
  'resilience_narrative_positive',
  'resilience_narrative_negative',
  'non_compliance_due_to_distrust',
  'evacuation_displacement',
  'self_evacuation_unauthorized',
  'population_survey_finding',
  'early_warning_system_failure',
  'connectivity_outage',
  'institutional_abandonment_perception',
  'routine_disruption',
  'wellbeing_support_gap',
  'information_inclusivity_gap',
  'feedback_channel_blocked',
  'system_overload',
  'social_isolation',
];

// --- Catalog list formatting -------------------------------------------------

/**
 * Format catalog entries grouped by domain for the extraction system prompt.
 * @param {Array<object>} [entries] defaults to full SIGNAL_CATALOG
 * @returns {string} markdown-ish domain sections with `type` [class]: label lines
 */
export function formatSignalCatalog(entries = SIGNAL_CATALOG) {
  const byDomain = {};
  for (const s of entries) {
    if (!byDomain[s.domain]) byDomain[s.domain] = [];
    byDomain[s.domain].push(s);
  }
  return Object.entries(byDomain).map(([domain, signals]) => {
    const lines = signals.map((s) => {
      const cls = s.signal_class ? ` [${s.signal_class}]` : '';
      return `  - \`${s.type}\`${cls}: ${s.label}`;
    });
    return `**${domain}**\n${lines.join('\n')}`;
  }).join('\n\n');
}

/**
 * Domain-restricted catalog view for multipass extraction (one pass per domain set).
 * @param {string[]} domains SIGNAL_DOMAINS keys to include
 * @returns {string}
 */
export function formatSignalCatalogSubset(domains) {
  const allowed = new Set(domains);
  return formatSignalCatalog(SIGNAL_CATALOG.filter((s) => allowed.has(s.domain)));
}

// --- Disambiguation / boundaries ---------------------------------------------

/**
 * One catalog entry's disambiguation block (NOT / ACCEPT / REJECT / EXAMPLE lines).
 * Omits mirror/related to save stable-prefix budget — mirrors go to E5 self-check.
 * @param {object} entry SignalCatalogEntry
 * @returns {string} empty when the entry has no usable disambiguation fields
 */
function formatEntryDisambiguation(entry) {
  const d = entry.disambiguation;
  if (!d?.not_confused_with?.length && !d?.accept_patterns?.length && !d?.reject_patterns?.length
    && !entry.example_evidence?.length) return '';

  const lines = [`- \`${entry.type}\`:`];
  // `mirror` and `related` are deliberately NOT emitted here: mirror pairs feed
  // the E5 self-check hint (formatMirrorSelfCheckHint), and `related` is a loose
  // association with no polarity implication — neither earns boundary-block
  // chars in the hard-budgeted stable prefix.
  if (d?.not_confused_with?.length) {
    lines.push('  NOT: ' + d.not_confused_with.map((t) => '`' + t + '`').join(', '));
  }
  for (const p of d?.accept_patterns ?? []) {
    lines.push(`  ACCEPT: ${p}`);
  }
  for (const p of d?.reject_patterns ?? []) {
    lines.push(`  REJECT: ${p}`);
  }
  // EXAMPLE duplicates ACCEPT's role as a positive exemplar — emit it only
  // when no accept_patterns exist (the stable prefix has a hard char budget).
  if (!d?.accept_patterns?.length) {
    for (const ex of entry.example_evidence ?? []) {
      lines.push(`  EXAMPLE: ${ex}`);
    }
  }
  return lines.join('\n');
}

/**
 * Catalog-driven classification boundaries for extraction prompts.
 * Walks priority types (or opts.types), caps at maxEntries, skips empty blocks.
 * @param {{ types?: string[], maxEntries?: number }} [opts]
 * @returns {string} fallback prose when no entry yields a block
 */
export function formatDisambiguationBlock(opts = {}) {
  const priority = opts.types ?? DISAMBIGUATION_PRIORITY_TYPES;
  const maxEntries = opts.maxEntries ?? priority.length;
  const seen = new Set();
  const blocks = [];

  for (const type of priority) {
    if (blocks.length >= maxEntries) break;
    const entry = getSignalCatalogEntry(type);
    if (!entry || seen.has(type)) continue;
    const block = formatEntryDisambiguation(entry);
    if (!block) continue;
    seen.add(type);
    blocks.push(block);
  }

  if (blocks.length === 0) {
    return 'Use signal labels and mirrors in the catalog below. One atomic fact per signal.\n';
  }

  return (
    'Catalog-driven boundaries:\n' +
    `${blocks.join('\n')}\n\n` +
    'Other types: follow catalog labels and mirror pairs.\n'
  );
}

// --- Mirror self-check (E5) --------------------------------------------------

/**
 * Mirror lookup for E5 self-check: declared type → paired opposite/mirror type id.
 * @param {string} signalType
 * @returns {string|null}
 */
export function getMirrorTypeForSelfCheck(signalType) {
  const entry = getSignalCatalogEntry(signalType);
  return entry?.mirror ?? null;
}

/**
 * Extra self-check instruction when the declared type has a catalog mirror pair.
 * @param {string} signalType
 * @returns {string} empty when no mirror; otherwise a "vote no if mirror fits better" clause
 */
export function formatMirrorSelfCheckHint(signalType) {
  const mirror = getMirrorTypeForSelfCheck(signalType);
  if (!mirror) return '';
  const mirrorEntry = getSignalCatalogEntry(mirror);
  const mirrorLabel = mirrorEntry?.label ?? mirror;
  return (
    ` If the evidence clearly fits \`${mirror}\` (${mirrorLabel}) better than the declared type, vote "no".`
  );
}
