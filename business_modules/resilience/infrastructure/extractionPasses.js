/**
 * Domain-grouped extraction support: catalog subsetting, multipass groupings,
 * self-check prompt construction. Pure helpers so they can be unit-tested
 * without an LLM client.
 */

import { SIGNAL_TYPES } from '../domain/services/behaviorSignals.js';
import {
  formatSignalCatalogSubset as formatCatalogSubset,
  getMirrorTypeForSelfCheck,
} from '../domain/services/signalCatalogPrompt.js';

/**
 * Three grouped passes balance per-pass focus against API cost.
 * Each pass receives the full classification rules but a focused signal vocabulary.
 */
export const DOMAIN_GROUPS = Object.freeze({
  A: ['compliance', 'risk', 'preparedness', 'environmental'],
  B: ['information', 'continuity', 'leadership', 'adaptation', 'education', 'trust', 'cyber', 'diaspora'],
  C: ['social', 'narrative', 'resources', 'wellbeing', 'memory', 'hostage'],
});

export const DOMAIN_GROUP_LABELS = Object.freeze({
  A: 'Protective Behavior (compliance + risk + preparedness + environmental)',
  B: 'Institutional Response (information + continuity + leadership + adaptation + education + trust + cyber + diaspora)',
  C: 'Social Fabric & Wellbeing (social + narrative + resources + wellbeing + memory + hostage)',
});

/**
 * Returns whether multipass extraction is enabled.
 * Default: ON. Set RESILIENCE_EXTRACT_MULTIPASS=0 to fall back to single-pass.
 */
export function isMultipassEnabled(env = process.env) {
  const v = env.RESILIENCE_EXTRACT_MULTIPASS;
  if (v == null) return true;
  return !(v === '0' || v === 'false' || v === 'off');
}

/**
 * Format a domain-restricted view of the signal catalog for a focused prompt.
 * The output mirrors `formatSignalCatalog` from claudeEvaluator.js but only
 * includes signal types whose `domain` is in the allowed list.
 */
export function formatSignalCatalogSubset(domains) {
  return formatCatalogSubset(domains);
}

/**
 * Produces the additional prompt fragment that restricts a multipass call to
 * a single domain group. Inserted immediately before the SIGNAL TYPES section.
 */
export function buildDomainScopeSuffix(groupKey) {
  const domains = DOMAIN_GROUPS[groupKey];
  if (!domains) throw new Error(`unknown domain group: ${groupKey}`);
  const label = DOMAIN_GROUP_LABELS[groupKey];
  return (
    `━━━ THIS PASS — ${label.toUpperCase()} ━━━\n` +
    `For THIS extraction pass, ONLY emit signals whose type belongs to the domains: ` +
    `${domains.join(', ')}. Skip any candidate signal whose type does not appear in the ` +
    `subset list below — it will be picked up in another pass. Do NOT relabel a fact into ` +
    `a wrong domain just to fit this pass.\n\n` +
    `━━━ SIGNAL TYPES (closed vocabulary, this pass only) ━━━\n` +
    `${formatSignalCatalogSubset(domains)}\n\n`
  );
}

/**
 * Build the closed-vocab self-check prompt (E5). Sends signals (without the
 * source articles) to a cheap model, asking yes/no/uncertain on whether each
 * signal's evidence is a correct instance of its declared signal_type.
 */
export function buildSelfCheckPrompt(signals) {
  const validTypes = new Set(SIGNAL_TYPES);
  const items = signals.map((s, i) => ({
    index: i,
    type: validTypes.has(s.signal_type) ? s.signal_type : `INVALID(${s.signal_type})`,
    evidence: (s.evidence ?? '').slice(0, 240),
    declared_evidence_type: s.evidence_type ?? 'observational_reported_fact',
    mirror: validTypes.has(s.signal_type) ? getMirrorTypeForSelfCheck(s.signal_type) : null,
  }));

  const list = items
    .map((it) => {
      const mirrorNote = it.mirror ? ` | mirror=${it.mirror}` : '';
      return `${it.index}. type=${it.type}${mirrorNote} | evidence_type=${it.declared_evidence_type} | "${it.evidence}"`;
    })
    .join('\n');

  const system =
    `You are a closed-vocabulary signal classifier. For each candidate signal below, ` +
    `decide whether its evidence text is a correct instance of its declared signal_type. ` +
    `Use only the closed vocabulary; never propose alternative types.\n` +
    `When a mirror type is listed, vote "no" if the evidence clearly fits the mirror better.\n\n` +
    `Output a JSON array of {"index":N,"verdict":"yes"|"no"|"uncertain"} — one per signal.\n` +
    `Be strict: vote "no" only when the evidence clearly does not match the declared type.\n` +
    `Vote "uncertain" when the evidence is ambiguous; vote "yes" otherwise.`;

  const user =
    `Verify these ${items.length} signals (one per line):\n\n${list}\n\n` +
    `Return only the JSON array. No prose.`;

  return { system, user, indices: items.map((it) => it.index) };
}
