/**
 * Cross-report claim critique — recurring weak/unsupported claims across N reports.
 *
 * Pipeline position: post-hoc user QA. Runs over finished report JSONs only;
 * never during assess. Complements `criticAgent` (single component, in-run) and
 * `omissionAuditService` (false negatives) by looking at *false positives that
 * repeat*: a claim that is thin once is noise, the same thin claim in five
 * reports is a systematic extraction or narrative defect.
 *
 * Owns: claim ref resolution against report signals, per-claim weakness vocabulary,
 * claim-text normalization + recurrence clustering, cross-report aggregation.
 * Does NOT: read or write files (see `app/assessment/crossReportCritiqueService.js`),
 * call LLMs, or mutate reports.
 *
 * Key collaborators: `narrative/signalRefRegistry.js` (canonical ref key — this
 * module parses and reuses it, never redefines it), `narrative/narrativeClaims.js`
 * (claim shape), `narrativeGrounding/groundingConfig.js` (grounding min score),
 * `app/assessment/crossReportCritiqueService.js`.
 */

import { signalArticleKey } from '../narrative/signalRefRegistry.js';
import {
  classifyClaimRef,
  canonicalClaimRef,
  CLAIM_REF_NAMESPACES,
} from '../narrative/claimRefNamespace.js';

/** Closed vocabulary of per-claim weaknesses. Ordered roughly by severity. */
export const CLAIM_WEAKNESS_KINDS = Object.freeze({
  /** Claim carries no signal_refs at all. */
  NO_REFS: 'no_refs',
  /** Ref cites a signal_type that exists in the report, but no signal at that article. */
  UNRESOLVED_REF: 'unresolved_ref',
  /** Ref cites a signal_type that appears nowhere in the report's signals. */
  UNKNOWN_TYPE_REF: 'unknown_type_ref',
  /** Ref points outside the signal namespace (e.g. `open:obs-3`) and is not embedded in the report. */
  EXTERNAL_REF: 'external_ref',
  /** Every supporting signal came from one article. */
  SINGLE_ARTICLE: 'single_article',
  /** Every supporting signal came from one source (outlet / PBO / visit). */
  SINGLE_SOURCE: 'single_source',
  /** Every supporting signal came from one source_type channel. */
  SINGLE_CHANNEL: 'single_channel',
  /** Support rests on inferred rather than present_in_text evidence. */
  INFERRED_SUPPORT: 'inferred_support',
  /** Best supporting extraction_confidence is below threshold. */
  LOW_CONFIDENCE_SUPPORT: 'low_confidence_support',
  /** No supporting signal reached grounding_tier `grounded`. */
  UNGROUNDED_SUPPORT: 'ungrounded_support',
  /** Claim sits in a component whose narrative scored below the grounding minimum. */
  LOW_GROUNDING_COMPONENT: 'low_grounding_component',
  /** Claim sits in a component flagged interpretive_summary. */
  INTERPRETIVE_COMPONENT: 'interpretive_component',
  /** Claim sits in a component with a source concentration warning. */
  CONCENTRATED_COMPONENT: 'concentrated_component',
});

/**
 * Severity tier per weakness kind.
 *
 * `unsupported` — the claim's own evidence does not carry it.
 * `thin` — evidence exists but rests on a single point of failure.
 * `context` — a property of the surrounding component, not of this claim.
 *
 * The tiers matter because context weaknesses apply to every claim in a
 * component at once; folding them into the claim verdict marks 100% of claims
 * weak and destroys the ranking.
 */
export const CLAIM_WEAKNESS_TIERS = Object.freeze({
  [CLAIM_WEAKNESS_KINDS.NO_REFS]: 'unsupported',
  [CLAIM_WEAKNESS_KINDS.UNRESOLVED_REF]: 'unsupported',
  [CLAIM_WEAKNESS_KINDS.UNKNOWN_TYPE_REF]: 'unsupported',
  [CLAIM_WEAKNESS_KINDS.INFERRED_SUPPORT]: 'unsupported',
  [CLAIM_WEAKNESS_KINDS.UNGROUNDED_SUPPORT]: 'unsupported',
  [CLAIM_WEAKNESS_KINDS.SINGLE_ARTICLE]: 'thin',
  [CLAIM_WEAKNESS_KINDS.SINGLE_SOURCE]: 'thin',
  [CLAIM_WEAKNESS_KINDS.SINGLE_CHANNEL]: 'thin',
  [CLAIM_WEAKNESS_KINDS.LOW_CONFIDENCE_SUPPORT]: 'thin',
  [CLAIM_WEAKNESS_KINDS.EXTERNAL_REF]: 'thin',
  [CLAIM_WEAKNESS_KINDS.LOW_GROUNDING_COMPONENT]: 'context',
  [CLAIM_WEAKNESS_KINDS.INTERPRETIVE_COMPONENT]: 'context',
  [CLAIM_WEAKNESS_KINDS.CONCENTRATED_COMPONENT]: 'context',
});

/** Weaknesses that make a claim *unsupported* rather than merely thin. */
export const UNSUPPORTED_WEAKNESS_KINDS = Object.freeze(
  Object.entries(CLAIM_WEAKNESS_TIERS)
    .filter(([, tier]) => tier === 'unsupported')
    .map(([kind]) => kind),
);

/** Defaults; callers may override from env-backed config. */
export const CRITIQUE_DEFAULTS = Object.freeze({
  /** extraction_confidence below this counts as low-confidence support. */
  minSupportConfidence: 0.6,
  /** narrative_grounding_score below this flags the whole component. */
  minGroundingScore: 0.6,
  /** A normalized claim seen in at least this many reports is "recurring". */
  minRecurrence: 2,
  /** Jaccard token overlap at or above which two claims are the same claim. */
  claimSimilarity: 0.7,
  /** Tokens shorter than this are dropped before comparison. */
  minTokenLength: 3,
});

// ── Claim text normalization ─────────────────────────────────────────────────

/**
 * Stopwords stripped before clustering. Deliberately small: these are the words
 * that make two structurally identical claims look different, not domain terms.
 */
const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
  'has', 'have', 'had', 'not', 'but', 'their', 'its', 'his', 'her', 'they',
  'been', 'being', 'into', 'onto', 'over', 'under', 'during', 'amid', 'while',
  'continue', 'continues', 'continued', 'ongoing', 'report', 'reports',
  'reported', 'reporting', 'residents', 'israeli', 'israel',
]);

/**
 * Reduce a claim to a comparable token set: lowercase, dates/numbers/locale
 * punctuation removed, stopwords dropped. Hebrew and Latin script both survive.
 *
 * @param {string} text
 * @param {number} [minTokenLength]
 * @returns {string[]} sorted unique tokens
 */
export function claimTokens(text, minTokenLength = CRITIQUE_DEFAULTS.minTokenLength) {
  const stripped = String(text ?? '')
    .toLowerCase()
    .replaceAll(/\d{4}-\d{2}-\d{2}/g, ' ')
    .replaceAll(/[\d%]+/g, ' ')
    .replaceAll(/[^\p{L}\s]/gu, ' ');

  const tokens = stripped
    .split(/\s+/)
    .filter((t) => t.length >= minTokenLength && !STOPWORDS.has(t));

  return [...new Set(tokens)].sort();
}

/**
 * Stable key for exact-match claim recurrence.
 *
 * @param {string} text
 * @returns {string}
 */
export function normalizeClaimText(text) {
  return claimTokens(text).join(' ');
}

/**
 * Jaccard similarity of two token sets.
 *
 * @param {string[]} a
 * @param {string[]} b
 * @returns {number} 0–1
 */
export function tokenSimilarity(a, b) {
  if (a.length === 0 || b.length === 0) return 0;
  const setB = new Set(b);
  let shared = 0;
  for (const t of a) if (setB.has(t)) shared += 1;
  const union = a.length + b.length - shared;
  return union === 0 ? 0 : shared / union;
}

// ── Ref resolution ───────────────────────────────────────────────────────────

/**
 * Parse a signal-namespace ref into type and article key, or null when the ref
 * belongs to another namespace (retrieval chunk, OOV, open observation).
 *
 * Delegates classification to the shared vocabulary so legacy bare-index refs
 * (`type@1`, written before the evidence graph aligned on `buildRefKey`) resolve
 * against current reports instead of being counted as broken citations.
 *
 * @param {string} ref
 * @returns {{ signalType: string, articleKey: string } | null}
 */
export function parseSignalRef(ref) {
  const parsed = classifyClaimRef(ref);
  if (parsed.namespace !== CLAIM_REF_NAMESPACES.SIGNAL) return null;
  return { signalType: parsed.signalType, articleKey: parsed.articleKey };
}


/**
 * Index a report's signals by ref key for O(1) claim resolution.
 *
 * @param {object[]} signals
 * @returns {Map<string, object[]>}
 */
export function indexSignalsByRef(signals) {
  /** @type {Map<string, object[]>} */
  const byRef = new Map();
  for (const s of signals ?? []) {
    const type = s?.signal_type ?? s?.type ?? 'unknown';
    const ref = `${type}@${signalArticleKey(s)}`;
    const bucket = byRef.get(ref);
    if (bucket) bucket.push(s);
    else byRef.set(ref, [s]);
  }
  return byRef;
}

// ── Per-claim critique ───────────────────────────────────────────────────────

function isInferred(signal) {
  return String(signal?.evidence_basis ?? '').trim() === 'inferred';
}

/** Only news-path signals carry grounding_tier; absent ≠ ungrounded. */
function hasGroundingTier(signal) {
  return String(signal?.grounding_tier ?? '').trim() !== '';
}

function isGrounded(signal) {
  return String(signal?.grounding_tier ?? '').trim() === 'grounded';
}

function supportConfidence(signal) {
  const v = Number(signal?.extraction_confidence ?? signal?.confidence);
  return Number.isFinite(v) ? v : null;
}

function distinct(values) {
  return [...new Set(values.filter((v) => v != null && v !== ''))];
}

/**
 * Context weaknesses inherited from the component the claim sits in.
 *
 * @param {object} component
 * @param {object} thresholds
 * @param {object} reportContext
 * @returns {Array<{ kind: string, detail: string }>}
 */
function componentWeaknesses(component, thresholds, reportContext) {
  const out = [];
  const score = Number(component?.narrative_grounding_score);
  // Suppressed only when grounding never ran (null score); a computed 0 is a
  // real finding and must survive.
  if (reportContext?.groundingComputed !== false
    && component?.narrative_grounding_score != null
    && Number.isFinite(score) && score < thresholds.minGroundingScore) {
    out.push({
      kind: CLAIM_WEAKNESS_KINDS.LOW_GROUNDING_COMPONENT,
      detail: `narrative_grounding_score ${score.toFixed(3)} < ${thresholds.minGroundingScore}`,
    });
  }
  if (component?.interpretive_summary === true) {
    out.push({
      kind: CLAIM_WEAKNESS_KINDS.INTERPRETIVE_COMPONENT,
      detail: 'component prose flagged interpretive_summary',
    });
  }
  const warn = component?.evidence_basis?.concentration_warning;
  if (warn?.key) {
    out.push({
      kind: CLAIM_WEAKNESS_KINDS.CONCENTRATED_COMPONENT,
      detail: `${warn.layer}=${warn.key} at ${Math.round((warn.share ?? 0) * 100)}% of component evidence`,
    });
  }
  return out;
}

/**
 * Resolve claim signal_refs against the report signal index.
 *
 * A miss splits two ways, and the distinction is the whole point: a ref naming a
 * signal_type the report never produced is an analytical defect (the claim cites
 * evidence that does not exist), while a ref naming a known type at an article
 * key that does not match is ref-registry drift between narrative build and
 * report serialization — a tooling defect. Both leave the claim untraceable.
 *
 * Refs with no `@` belong to another namespace entirely (`open:obs-3` points at
 * the open-observation bundle, which reports only summarize) — traceable in
 * principle, just not from this file.
 *
 * An unresolved ref is further split by whether the cited *article* exists in
 * the report: if it does, the claim attributes the article's evidence to a
 * signal type that was never extracted from it (mis-attribution); if it does
 * not, the article dropped out between narrative build and serialization.
 *
 * @param {string[]} refs
 * @param {Map<string, object[]>} signalsByRef
 * @param {object} [context] `{ signalTypes, articleKeys }` sets from the report
 * @returns {{ support: object[], unresolved: string[], unknownType: string[],
 *   external: string[], misattributed: string[] }}
 */
function resolveClaimSupport(refs, signalsByRef, context = {}) {
  const knownTypes = context.signalTypes ?? null;
  const knownArticles = context.articleKeys ?? null;
  /** @type {object[]} */
  const support = [];
  /** @type {string[]} */
  const unresolved = [];
  /** @type {string[]} */
  const unknownType = [];
  /** @type {string[]} */
  const external = [];
  /** @type {string[]} */
  const misattributed = [];

  for (const ref of refs) {
    // Canonical first, so a legacy bare-index citation resolves like any other.
    const matches = signalsByRef.get(canonicalClaimRef(ref));
    if (matches?.length) {
      support.push(...matches);
      continue;
    }
    const parsed = parseSignalRef(ref);
    if (!parsed) {
      external.push(ref);
      continue;
    }
    if (knownTypes && !knownTypes.has(parsed.signalType)) {
      unknownType.push(ref);
      continue;
    }
    unresolved.push(ref);
    if (knownArticles?.has(parsed.articleKey)) misattributed.push(ref);
  }

  return { support, unresolved, unknownType, external, misattributed };
}

/**
 * Claim-level weaknesses from resolved supporting signals (diversity / quality).
 *
 * @param {object[]} support
 * @param {object} thresholds
 * @param {{ articles: string[], sources: string[], channels: string[] }} diversity
 * @returns {Array<{ kind: string, detail: string }>}
 */
function supportQualityWeaknesses(support, thresholds, diversity) {
  if (support.length === 0) return [];
  /** @type {Array<{ kind: string, detail: string }>} */
  const out = [];
  const { articles, sources, channels } = diversity;

  if (articles.length === 1) {
    out.push({
      kind: CLAIM_WEAKNESS_KINDS.SINGLE_ARTICLE,
      detail: `all ${support.length} supporting signal(s) from one article (${articles[0]})`,
    });
  }
  if (sources.length === 1) {
    out.push({
      kind: CLAIM_WEAKNESS_KINDS.SINGLE_SOURCE,
      detail: `only source: ${sources[0] ?? 'unknown'}`,
    });
  }
  if (channels.length === 1) {
    out.push({
      kind: CLAIM_WEAKNESS_KINDS.SINGLE_CHANNEL,
      detail: `only source_type: ${channels[0] ?? 'unknown'}`,
    });
  }
  if (support.every(isInferred)) {
    out.push({
      kind: CLAIM_WEAKNESS_KINDS.INFERRED_SUPPORT,
      detail: 'every supporting signal has evidence_basis=inferred',
    });
  }
  const tiered = support.filter(hasGroundingTier);
  if (tiered.length > 0 && !tiered.some(isGrounded)) {
    out.push({
      kind: CLAIM_WEAKNESS_KINDS.UNGROUNDED_SUPPORT,
      detail: `no supporting signal reached grounding_tier=grounded `
        + `(tiers: ${distinct(tiered.map((s) => s.grounding_tier)).join(', ')})`,
    });
  }
  const confidences = support.map(supportConfidence).filter((v) => v != null);
  const best = confidences.length ? Math.max(...confidences) : null;
  if (best != null && best < thresholds.minSupportConfidence) {
    out.push({
      kind: CLAIM_WEAKNESS_KINDS.LOW_CONFIDENCE_SUPPORT,
      detail: `best extraction_confidence ${best} < ${thresholds.minSupportConfidence}`,
    });
  }
  return out;
}

/**
 * Critique one narrative claim against the signals that are supposed to support it.
 *
 * @param {object} params
 * @param {object} params.claim `{ text, signal_refs, relation }`
 * @param {object} params.component owning component assessment
 * @param {Map<string, object[]>} params.signalsByRef from `indexSignalsByRef`
 * @param {object} [params.thresholds]
 * @param {object} [params.reportContext] `{ groundingComputed }`
 * @returns {object} claim critique record
 */
export function critiqueClaim({
  claim,
  component,
  signalsByRef,
  thresholds = CRITIQUE_DEFAULTS,
  reportContext = {},
}) {
  const refs = Array.isArray(claim?.signal_refs) ? claim.signal_refs : [];
  /** @type {Array<{ kind: string, detail: string }>} */
  const weaknesses = [];

  const { support, unresolved, unknownType, external, misattributed } = resolveClaimSupport(
    refs,
    signalsByRef,
    reportContext,
  );

  if (refs.length === 0) {
    weaknesses.push({ kind: CLAIM_WEAKNESS_KINDS.NO_REFS, detail: 'claim carries no signal_refs' });
  }
  if (unknownType.length > 0) {
    weaknesses.push({
      kind: CLAIM_WEAKNESS_KINDS.UNKNOWN_TYPE_REF,
      detail: `${unknownType.length}/${refs.length} refs cite a signal_type absent from the report: `
        + unknownType.slice(0, 3).join(', '),
    });
  }
  if (unresolved.length > 0) {
    weaknesses.push({
      kind: CLAIM_WEAKNESS_KINDS.UNRESOLVED_REF,
      detail: `${unresolved.length}/${refs.length} refs name a known signal_type but no signal at `
        + `that article (${misattributed.length} cite an article the report does have, i.e. the `
        + `type was never extracted from it): ${unresolved.slice(0, 3).join(', ')}`,
    });
  }
  if (external.length > 0) {
    weaknesses.push({
      kind: CLAIM_WEAKNESS_KINDS.EXTERNAL_REF,
      detail: `${external.length}/${refs.length} refs point outside the report's signal set `
        + `(not verifiable from the report alone): ${external.slice(0, 3).join(', ')}`,
    });
  }

  const articles = distinct(support.map((s) => signalArticleKey(s)));
  const sources = distinct(support.map((s) => s.article_source));
  const channels = distinct(support.map((s) => s.source_type));
  weaknesses.push(...supportQualityWeaknesses(support, thresholds, { articles, sources, channels }));

  const all = [...weaknesses, ...componentWeaknesses(component, thresholds, reportContext)];

  const claimKinds = distinct(
    all.filter((w) => CLAIM_WEAKNESS_TIERS[w.kind] !== 'context').map((w) => w.kind),
  );
  const contextKinds = distinct(
    all.filter((w) => CLAIM_WEAKNESS_TIERS[w.kind] === 'context').map((w) => w.kind),
  );

  return {
    component_id: component?.component_id ?? null,
    text: String(claim?.text ?? ''),
    normalized: normalizeClaimText(claim?.text),
    tokens: claimTokens(claim?.text),
    relation: claim?.relation ?? null,
    signal_refs: refs,
    signal_types: distinct(refs.map((r) => parseSignalRef(r)?.signalType)),
    support_count: support.length,
    distinct_articles: articles.length,
    distinct_sources: sources.length,
    distinct_channels: channels.length,
    sources,
    weaknesses: all,
    /** Claim-level only (`unsupported` + `thin`); context kinds live separately. */
    weakness_kinds: claimKinds,
    context_kinds: contextKinds,
    unsupported: claimKinds.some((k) => UNSUPPORTED_WEAKNESS_KINDS.includes(k)),
  };
}

// ── Per-report critique ──────────────────────────────────────────────────────

/**
 * Identity of a report for aggregation and citation.
 *
 * @param {object} report
 * @param {string} [filename]
 * @returns {object}
 */
function reportIdentity(report, filename) {
  const a = report?.assessment ?? {};
  return {
    file: filename ?? null,
    date: a.date ?? report?.assessment_window?.report_date ?? null,
    scope: a.report_scope?.id ?? null,
    days: report?.assessment_window?.days ?? null,
    generated_at: report?.generated_at ?? null,
    total_articles_analyzed: a.total_articles_analyzed ?? null,
  };
}

/**
 * Whether narrative grounding actually ran for this report.
 *
 * The test is null vs non-null, not zero vs non-zero, and it is deliberately
 * independent of `narrative_pipeline_degraded`. `computeGroundingScores` runs
 * unconditionally in the narrative pipeline, so a degraded report still carries
 * real scores; what produces a null score is the pipeline not running at all
 * (legacy/agent path). Excusing a degraded report would hide its true finding:
 * a score of 0 means prose that shares no measurable overlap with its cited
 * evidence — the single most damning thing this pass can report.
 *
 * @param {object} report
 * @returns {boolean}
 */
function groundingWasComputed(report) {
  const components = report?.assessment?.components ?? [];
  return components.some((c) => c?.narrative_grounding_score != null);
}

/**
 * Critique every narrative claim in one report.
 *
 * @param {object} report parsed report JSON
 * @param {object} [options]
 * @param {string} [options.filename]
 * @param {object} [options.thresholds]
 * @returns {object} `{ report, claims, component_summary }`
 */
export function critiqueReport(report, { filename, thresholds = CRITIQUE_DEFAULTS } = {}) {
  const components = report?.assessment?.components ?? [];
  const signalsByRef = indexSignalsByRef(report?.signals ?? []);
  const identity = reportIdentity(report, filename);
  const reportContext = {
    groundingComputed: groundingWasComputed(report),
    signalTypes: new Set((report?.signals ?? []).map((s) => s?.signal_type ?? s?.type).filter(Boolean)),
    articleKeys: new Set((report?.signals ?? []).map((s) => signalArticleKey(s))),
  };

  /** @type {object[]} */
  const claims = [];
  /** @type {object[]} */
  const componentSummary = [];

  for (const component of components) {
    const componentClaims = (component?.narrative_claims ?? []).map((claim) => ({
      ...critiqueClaim({ claim, component, signalsByRef, thresholds, reportContext }),
      report: identity,
    }));
    claims.push(...componentClaims);

    componentSummary.push({
      component_id: component?.component_id ?? null,
      confidence: component?.confidence ?? null,
      signal_count: component?.signal_count ?? null,
      claim_count: componentClaims.length,
      narrative_grounding_score: component?.narrative_grounding_score ?? null,
      interpretive_summary: component?.interpretive_summary === true,
      assessment_state: component?.assessment_state ?? null,
      weak_claim_count: componentClaims.filter((c) => c.weakness_kinds.length > 0).length,
      unsupported_claim_count: componentClaims.filter((c) => c.unsupported).length,
      concentration_warning: component?.evidence_basis?.concentration_warning ?? null,
    });
  }

  return {
    report: { ...identity, grounding_computed: reportContext.groundingComputed },
    claims,
    component_summary: componentSummary,
  };
}

// ── Cross-report aggregation ─────────────────────────────────────────────────

/**
 * Cluster claims across reports by normalized-token similarity, partitioned by
 * component. The same sentence asserted under two different components is two
 * different findings — merging them hides which component to fix.
 *
 * Greedy single-pass clustering against cluster seeds: deterministic given input
 * order, which callers fix by sorting reports chronologically.
 *
 * @param {object[]} claims claim critiques from one or more reports
 * @param {number} [similarity]
 * @returns {object[]} clusters
 */
export function clusterClaims(claims, similarity = CRITIQUE_DEFAULTS.claimSimilarity) {
  /** @type {Map<string, Array<{ seed: string[], members: object[] }>>} */
  const byComponent = new Map();

  for (const claim of claims) {
    const key = String(claim.component_id ?? 'unknown');
    const clusters = byComponent.get(key) ?? [];
    if (!byComponent.has(key)) byComponent.set(key, clusters);

    let target = null;
    let best = 0;
    for (const cluster of clusters) {
      const score = tokenSimilarity(claim.tokens, cluster.seed);
      if (score >= similarity && score > best) {
        best = score;
        target = cluster;
      }
    }
    if (target) target.members.push(claim);
    else clusters.push({ seed: claim.tokens, members: [claim] });
  }

  return [...byComponent.values()].flat();
}

function countBy(items, keyFn) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const item of items) {
    for (const key of [keyFn(item)].flat()) {
      if (key == null) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count]) => ({ key, count }));
}

/**
 * Fold per-report critiques into recurring-weakness findings.
 *
 * A finding is *recurring* when the same claim (by token similarity) appears in
 * at least `minRecurrence` distinct reports and carries at least one weakness in
 * every report it appears in. One thin claim is noise; the same thin claim in
 * five reports is a defect worth fixing.
 *
 * @param {object[]} reportCritiques output of `critiqueReport`, chronological
 * @param {object} [options]
 * @param {object} [options.thresholds]
 * @returns {object} aggregate critique artifact body
 */
export function aggregateCritiques(reportCritiques, { thresholds = CRITIQUE_DEFAULTS } = {}) {
  const allClaims = reportCritiques.flatMap((r) => r.claims);
  const weakClaims = allClaims.filter((c) => c.weakness_kinds.length > 0);

  const clusters = clusterClaims(weakClaims, thresholds.claimSimilarity);

  const recurring = clusters
    .map((cluster) => {
      const reportKeys = distinct(cluster.members.map((m) => `${m.report.scope}:${m.report.date}:${m.report.file}`));
      const dates = distinct(cluster.members.map((m) => m.report.date)).sort();
      const components = distinct(cluster.members.map((m) => m.component_id));
      const kinds = countBy(cluster.members, (m) => m.weakness_kinds);
      const persistentKinds = kinds
        .filter((k) => k.count === cluster.members.length)
        .map((k) => k.key);

      return {
        exemplar_text: cluster.members[0].text,
        component_id: cluster.members[0].component_id,
        recurrence: reportKeys.length,
        occurrences: cluster.members.length,
        verbatim_repeat: distinct(cluster.members.map((m) => m.text)).length === 1,
        dates,
        components,
        signal_types: distinct(cluster.members.flatMap((m) => m.signal_types)),
        sources: distinct(cluster.members.flatMap((m) => m.sources)),
        weakness_counts: kinds,
        persistent_weaknesses: persistentKinds,
        unsupported_in: cluster.members.filter((m) => m.unsupported).length,
        variants: distinct(cluster.members.map((m) => m.text)).slice(0, 6),
        members: cluster.members.map((m) => ({
          date: m.report.date,
          scope: m.report.scope,
          file: m.report.file,
          component_id: m.component_id,
          text: m.text,
          support_count: m.support_count,
          distinct_articles: m.distinct_articles,
          distinct_sources: m.distinct_sources,
          weakness_kinds: m.weakness_kinds,
        })),
      };
    })
    // A cluster is only a finding when the *same* weakness holds in every
    // occurrence. Intermittent weakness is a one-off, not a systematic defect.
    .filter((f) => f.recurrence >= thresholds.minRecurrence && f.persistent_weaknesses.length > 0)
    .sort((a, b) =>
      b.unsupported_in - a.unsupported_in
      || b.recurrence - a.recurrence
      || b.occurrences - a.occurrences);

  // Component-level chronic weakness: which components are weak in most reports.
  const componentRows = reportCritiques.flatMap((r) =>
    r.component_summary.map((c) => ({
      ...c,
      date: r.report.date,
      file: r.report.file,
      grounding_computed: r.report.grounding_computed,
    })));
  const byComponent = new Map();
  for (const row of componentRows) {
    const acc = byComponent.get(row.component_id) ?? {
      component_id: row.component_id,
      reports: 0,
      claims: 0,
      weak_claims: 0,
      unsupported_claims: 0,
      /** Reports where grounding actually ran — the denominator for the two below. */
      graded_reports: 0,
      low_grounding_reports: 0,
      interpretive_reports: 0,
      concentrated_reports: 0,
      grounding_scores: [],
    };
    acc.reports += 1;
    acc.claims += row.claim_count;
    acc.weak_claims += row.weak_claim_count;
    acc.unsupported_claims += row.unsupported_claim_count;
    const score = Number(row.narrative_grounding_score);
    // Scores from a degraded narrative pipeline are zeros by omission — counting
    // them as low grounding would indict every component in every such report.
    if (row.grounding_computed !== false && Number.isFinite(score)) {
      acc.graded_reports += 1;
      acc.grounding_scores.push(score);
      if (score < thresholds.minGroundingScore) acc.low_grounding_reports += 1;
    }
    if (row.interpretive_summary) acc.interpretive_reports += 1;
    if (row.concentration_warning?.key) acc.concentrated_reports += 1;
    byComponent.set(row.component_id, acc);
  }

  const componentFindings = [...byComponent.values()]
    .map((acc) => {
      const scores = acc.grounding_scores;
      const { grounding_scores: _drop, ...rest } = acc;
      return {
        ...rest,
        weak_claim_share: acc.claims > 0 ? Number((acc.weak_claims / acc.claims).toFixed(3)) : 0,
        unsupported_claim_share: acc.claims > 0
          ? Number((acc.unsupported_claims / acc.claims).toFixed(3))
          : 0,
        median_grounding_score: scores.length
          ? Number([...scores].sort((a, b) => a - b)[Math.floor(scores.length / 2)].toFixed(3))
          : null,
      };
    })
    .sort((a, b) => b.unsupported_claim_share - a.unsupported_claim_share
      || b.weak_claim_share - a.weak_claim_share);

  const groundingSkipped = reportCritiques
    .filter((r) => r.report.grounding_computed === false)
    .map((r) => r.report.date);

  return {
    reports: reportCritiques.map((r) => r.report),
    thresholds,
    caveats: groundingSkipped.length > 0
      ? [{
        kind: 'grounding_not_computed',
        detail: 'the narrative grounding pipeline did not run for these reports, so '
          + 'narrative_grounding_score is absent rather than low. Reports that did run '
          + 'and scored 0 are counted as genuinely ungrounded, not excused here',
        dates: groundingSkipped,
      }]
      : [],
    totals: {
      reports: reportCritiques.length,
      // Reports that produced no narrative claims at all contribute nothing to
      // the critique — worth seeing, since they silently shrink the sample.
      reports_without_claims: reportCritiques.filter((r) => r.claims.length === 0).length,
      claims: allClaims.length,
      weak_claims: weakClaims.length,
      unsupported_claims: allClaims.filter((c) => c.unsupported).length,
      thin_only_claims: allClaims.filter((c) => !c.unsupported && c.weakness_kinds.length > 0).length,
      clean_claims: allClaims.filter((c) => c.weakness_kinds.length === 0).length,
      recurring_findings: recurring.length,
    },
    weakness_frequency: countBy(allClaims, (c) => c.weakness_kinds),
    context_frequency: countBy(allClaims, (c) => c.context_kinds),
    signal_type_weakness: countBy(weakClaims, (c) => c.signal_types),
    source_weakness: countBy(weakClaims, (c) => c.sources),
    recurring_weak_claims: recurring,
    component_findings: componentFindings,
  };
}
