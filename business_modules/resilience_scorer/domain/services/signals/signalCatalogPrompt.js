/**
 * Catalog-driven prompt fragments for closed-vocabulary extraction.
 * Source of truth for labels/disambiguation: SIGNAL_CATALOG in signalCatalog.js.
 */

import { SIGNAL_CATALOG, getSignalCatalogEntry } from './signalCatalog.js';

/** Types with rich disambiguation metadata — emitted first in the boundaries block. */
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
  'rumor_spread',
  'non_compliance_due_to_distrust',
  'evacuation_displacement',
  'self_evacuation_unauthorized',
  'population_survey_finding',
  'early_warning_system_failure',
  'early_warning_system_effective',
  'connectivity_outage',
  'institutional_abandonment_perception',
  'infrastructure_damage_acute',
  'routine_disruption',
  'wellbeing_support_gap',
];

/**
 * Format catalog entries grouped by domain (optionally filtered).
 * @param {Array<object>} [entries]
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
 * Domain-restricted catalog view for multipass extraction.
 * @param {string[]} domains
 */
export function formatSignalCatalogSubset(domains) {
  const allowed = new Set(domains);
  return formatSignalCatalog(SIGNAL_CATALOG.filter((s) => allowed.has(s.domain)));
}

/**
 * One catalog entry's disambiguation block.
 * @param {object} entry
 */
function formatEntryDisambiguation(entry) {
  const d = entry.disambiguation;
  if (!d && !entry.example_evidence?.length && !entry.mirror && !entry.related?.length) return '';

  const lines = [`- \`${entry.type}\`:`];
  if (entry.mirror) {
    lines.push(`  Mirror (opposite outcome): \`${entry.mirror}\``);
  }
  if (entry.related?.length) {
    lines.push('  Related: ' + entry.related.map((t) => '`' + t + '`').join(', '));
  }
  if (d?.not_confused_with?.length) {
    lines.push('  NOT: ' + d.not_confused_with.map((t) => '`' + t + '`').join(', '));
  }
  for (const p of d?.accept_patterns ?? []) {
    lines.push(`  ACCEPT: ${p}`);
  }
  for (const p of d?.reject_patterns ?? []) {
    lines.push(`  REJECT: ${p}`);
  }
  for (const ex of entry.example_evidence ?? []) {
    lines.push(`  EXAMPLE: ${ex}`);
  }
  return lines.join('\n');
}

/**
 * Catalog-driven classification boundaries for extraction prompts.
 * @param {{ types?: string[], maxEntries?: number }} [opts]
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
    'Catalog-driven boundaries (types with explicit disambiguation metadata):\n' +
    `${blocks.join('\n')}\n\n` +
    'For all other types, follow domain labels and mirror pairs in the catalog list.\n'
  );
}

/**
 * Mirror lookup for E5 self-check: type -> mirror type label.
 * @param {string} signalType
 */
export function getMirrorTypeForSelfCheck(signalType) {
  const entry = getSignalCatalogEntry(signalType);
  return entry?.mirror ?? null;
}

/**
 * Extra self-check instruction when signal has a mirror pair.
 * @param {string} signalType
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
