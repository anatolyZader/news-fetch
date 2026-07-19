/**
 * Domain-grouped extraction support: catalog subsetting, multipass groupings,
 * self-check prompt construction. Pure helpers so they can be unit-tested
 * without an LLM client.
 */

import { SIGNAL_TYPES } from '../domain/services/signals/routing/signalRouter.js';
import {
  formatSignalCatalogSubset as formatCatalogSubset,
  getMirrorTypeForSelfCheck,
} from '../domain/services/signals/routing/signalCatalogPrompt.js';

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
 * Returns multipass mode: '0' single, '1' three-pass (default), '2' two-pass.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'0'|'1'|'2'}
 */
export function getMultipassMode(env = process.env) {
  const v = env.RESILIENCE_EXTRACT_MULTIPASS;
  if (v === '0' || v === 'false' || v === 'off') return '0';
  if (v === '2') return '2';
  return '1';
}

/**
 * Returns whether multipass extraction is enabled.
 * Default: ON (3-pass). Set RESILIENCE_EXTRACT_MULTIPASS=0 for single-pass.
 */
export function isMultipassEnabled(env = process.env) {
  return getMultipassMode(env) !== '0';
}

/** Two-pass merge: AB = institutional + protective, C = social/wellbeing */
export const TWO_PASS_GROUPS = Object.freeze({
  AB: [...DOMAIN_GROUPS.A, ...DOMAIN_GROUPS.B],
  C: [...DOMAIN_GROUPS.C],
});

export const TWO_PASS_LABELS = Object.freeze({
  AB: 'Protective + Institutional (merged pass)',
  C: 'Social Fabric & Wellbeing',
});

/**
 * Domain group keys for current multipass mode.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string[]}
 */
export function getMultipassGroupKeys(env = process.env) {
  const mode = getMultipassMode(env);
  if (mode === '0') return [];
  if (mode === '2') return ['AB', 'C'];
  return Object.keys(DOMAIN_GROUPS);
}

/**
 * Domains for a pass key (A/B/C or AB merged).
 * @param {string} groupKey
 */
export function domainsForPassKey(groupKey) {
  if (groupKey === 'AB') return TWO_PASS_GROUPS.AB;
  return DOMAIN_GROUPS[groupKey] ?? [];
}

/**
 * Produces domain scope suffix for a pass (supports merged AB).
 * @param {string} groupKey
 */
export function buildPassScopeSuffix(groupKey) {
  const domains = domainsForPassKey(groupKey);
  if (!domains.length) throw new Error(`unknown domain group: ${groupKey}`);
  const label = TWO_PASS_LABELS[groupKey] ?? DOMAIN_GROUP_LABELS[groupKey];
  return (
    `━━━ THIS PASS — ${String(label).toUpperCase()} ━━━\n` +
    `For THIS extraction pass, ONLY emit signals whose type belongs to the domains: ` +
    `${domains.join(', ')}. Skip any candidate signal whose type does not appear in the ` +
    `subset list below — it will be picked up in another pass. Do NOT relabel a fact into ` +
    `a wrong domain just to fit this pass.\n\n` +
    `━━━ SIGNAL TYPES (closed vocabulary, this pass only) ━━━\n` +
    `${formatSignalCatalogSubset(domains)}\n\n`
  );
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
  return buildPassScopeSuffix(groupKey);
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

/**
 * Residual observation pass for articles with zero closed-vocab signals.
 * Does not emit scored signal_type values — only structured observations for catalog learning.
 * @param {Array<{ url?: string, source?: string, body?: string, promptBody?: string }>} articles
 */
export function buildResidualCapturePrompt(articles) {
  const blocks = articles.map((art, i) => {
    const idx = i + 1;
    const body = String(art.promptBody ?? art.body ?? '').trim().slice(0, 1200);
    const meta = [
      art.url ? `url=${art.url}` : null,
      art.source ? `source=${art.source}` : null,
    ].filter(Boolean).join(' ');
    return `[Article ${idx}] ${meta}\n${body || '(no body)'}`;
  }).join('\n\n---\n\n');

  const system =
    `You identify observable civilian behavioral facts in Israeli emergency-coverage text ` +
    `that are poorly captured by a fixed resilience signal taxonomy.\n\n` +
    `Rules:\n` +
    `- Output ONLY facts grounded in the text (quote, named statistic, or reported action).\n` +
    `- Do NOT invent snake_case signal types.\n` +
    `- Do NOT summarize journalist opinion without a behavioral fact.\n` +
    `- For each observation list 1–3 nearest EXISTING taxonomy types if any fit partially.\n` +
    `- novelty_hint: "low" if an existing type fits well; "medium" if partial fit; "high" if genuinely novel.\n\n` +
    `Output a JSON array of objects:\n` +
    `{"article_index":N,"behavioral_description":"...","evidence":"verbatim or near-verbatim quote",` +
    `"nearest_existing_types":["type_a"],"novelty_hint":"low|medium|high"}\n` +
    `Return [] when no behavioral facts are present.`;

  const user =
    `These ${articles.length} article(s) yielded zero signals in closed-vocabulary extraction.\n` +
    `Find behavioral facts the taxonomy may be missing or mis-labeling:\n\n${blocks}\n\n` +
    `Return only the JSON array.`;

  return { system, user };
}
