/**
 * Field-channel ops RAG: report_build, audio scenes, social few-shot.
 */
import {
  reportBuildRagEnabled,
  reportBuildRagDays,
  reportBuildRagTopK,
  audioContextualizerRagEnabled,
  audioSceneRagTopK,
  socialClassifyRagEnabled,
  socialClassifyRagTopK,
  ragContextSnippetChars,
} from './ragConfig.js';
import { FIELD_EXAMPLES_INDEX_DATE } from './fieldExamplesIndexWriter.js';
import { HFC_INDEX_DATE } from './hfcGuidelinesIndexWriter.js';
import { SOCIAL_EXAMPLES_INDEX_DATE } from './socialExamplesIndexWriter.js';

const FIELD_CONTEXT_DISCLAIMER =
  'REFERENCE ONLY — do not add facts, names, localities, or numbers not present in structured state or dialogue.';

function clipSnippet(text, maxChars) {
  const s = String(text ?? '').replaceAll(/\s+/g, ' ').trim();
  const n = maxChars ?? ragContextSnippetChars();
  return s.length > n ? `${s.slice(0, n)}…` : s;
}

function dateWindowStart(endDate, days) {
  const d = new Date(`${endDate}T12:00:00`);
  d.setDate(d.getDate() - Math.max(0, days - 1));
  return d.toISOString().slice(0, 10);
}

/**
 * @param {object} structuredState
 * @param {Array<{role?: string, text?: string}>} [turnHistory]
 */
export function buildFieldReportQuery(structuredState, turnHistory = []) {
  const obs = structuredState?.observation ?? {};
  const parts = [
    obs.locality,
    obs.observedBehavior ?? obs.behavior,
    obs.affectedPopulation,
    ...(structuredState?.componentLinks ?? []).map((l) => l.componentId ?? l.component),
  ].filter(Boolean);

  const officerTurns = (turnHistory ?? [])
    .filter((t) => t.role === 'officer')
    .map((t) => String(t.text ?? '').trim())
    .slice(-3);
  if (officerTurns.length) parts.push(officerTurns.join(' '));

  return parts.join(' ').trim();
}

/**
 * @param {string} query
 * @param {{ retrieval: object, locality?: string, reportDate?: string, days?: number, topK?: number }} opts
 */
export async function retrieveSimilarFieldReports(query, opts) {
  if (!reportBuildRagEnabled() || !opts.retrieval?.hybridRetrieve) return [];
  const q = String(query ?? '').trim();
  if (!q) return [];

  const reportDate = opts.reportDate ?? new Date().toISOString().slice(0, 10);
  const days = opts.days ?? reportBuildRagDays();
  let enriched = q;
  if (opts.locality) enriched += ` ${opts.locality}`;

  const hits = await opts.retrieval.hybridRetrieve(enriched, {
    namespaces: ['archive'],
    reportDate,
    dateFrom: dateWindowStart(reportDate, days),
    dateTo: reportDate,
    dateWindowDays: days,
    sourceTypes: ['field', 'whatsapp', 'manual'],
    topKFinal: opts.topK ?? reportBuildRagTopK(),
    candidatePool: 36,
    skipRerank: true,
  });

  return hits.map((h) => ({
    source_id: h.parentId,
    title: h.title,
    date: h.date,
    source_type: h.sourceType,
    snippet: clipSnippet(h.text, 350),
  }));
}

/**
 * @param {string} text
 * @param {object} retrieval
 */
export async function retrieveFieldTaxonomyExamples(text, retrieval) {
  if (!reportBuildRagEnabled() || !retrieval?.hybridRetrieve) return [];
  const q = String(text ?? '').trim();
  if (!q) return [];

  const hits = await retrieval.hybridRetrieve(q, {
    namespaces: ['field_examples'],
    reportDate: FIELD_EXAMPLES_INDEX_DATE,
    dateFrom: FIELD_EXAMPLES_INDEX_DATE,
    dateTo: FIELD_EXAMPLES_INDEX_DATE,
    dateWindowDays: 1,
    topKFinal: reportBuildRagTopK(),
    candidatePool: 24,
    skipRerank: true,
  });

  return hits.slice(0, reportBuildRagTopK()).map((h) => ({
    type: h.parentId,
    snippet: clipSnippet(h.text, 280),
  }));
}

/**
 * @param {string} text
 * @param {object} retrieval
 */
export async function retrieveHfcGuidelines(text, retrieval) {
  if (!reportBuildRagEnabled() || !retrieval?.hybridRetrieve) return [];
  const q = String(text ?? '').trim();
  if (!q) return [];

  const hits = await retrieval.hybridRetrieve(q, {
    namespaces: ['hfc'],
    reportDate: HFC_INDEX_DATE,
    dateFrom: HFC_INDEX_DATE,
    dateTo: HFC_INDEX_DATE,
    dateWindowDays: 1,
    topKFinal: reportBuildRagTopK(),
    candidatePool: 20,
    skipRerank: true,
  });

  return hits.slice(0, reportBuildRagTopK()).map((h) => ({
    title: h.title,
    snippet: clipSnippet(h.text, 320),
  }));
}

/**
 * @param {{ station?: string, program?: string, locality?: string }} ctx
 * @param {object} retrieval
 */
export async function retrieveAudioSceneContext(ctx, retrieval) {
  if (!audioContextualizerRagEnabled() || !retrieval?.hybridRetrieve) {
    return { prior_scenes: [], place_hints: [] };
  }

  const parts = [ctx.station, ctx.program, ctx.locality].filter(Boolean);
  const q = parts.join(' ').trim() || 'radio field interview';
  const reportDate = new Date().toISOString().slice(0, 10);
  const days = 60;

  const hits = await retrieval.hybridRetrieve(q, {
    namespaces: ['archive'],
    reportDate,
    dateFrom: dateWindowStart(reportDate, days),
    dateTo: reportDate,
    dateWindowDays: days,
    sourceTypes: ['radio'],
    topKFinal: audioSceneRagTopK(),
    candidatePool: 30,
    skipRerank: true,
  });

  const prior_scenes = hits.map((h) => ({
    title: h.title,
    date: h.date,
    snippet: clipSnippet(h.text, 400),
  }));

  const place_hints = ctx.locality ? [ctx.locality] : [];

  return { prior_scenes, place_hints };
}

/**
 * @param {string} text
 * @param {object} retrieval
 */
export async function retrieveSocialFewShotExamples(text, retrieval) {
  if (!socialClassifyRagEnabled() || !retrieval?.hybridRetrieve) {
    return { keep: [], reject: [] };
  }
  const q = String(text ?? '').trim() || 'homefront civilian behavior Israel';

  const hits = await retrieval.hybridRetrieve(q, {
    namespaces: ['social_examples'],
    reportDate: SOCIAL_EXAMPLES_INDEX_DATE,
    dateFrom: SOCIAL_EXAMPLES_INDEX_DATE,
    dateTo: SOCIAL_EXAMPLES_INDEX_DATE,
    dateWindowDays: 1,
    topKFinal: socialClassifyRagTopK() * 2,
    candidatePool: 40,
    skipRerank: true,
  });

  const keep = [];
  const reject = [];
  const topK = socialClassifyRagTopK();

  for (const h of hits) {
    const body = String(h.text ?? '');
    const isKeep = body.includes('keep: true') || h.kind === 'social_keep';
    const isReject = body.includes('keep: false') || h.kind === 'social_reject';
    const entry = { snippet: clipSnippet(body, 350) };
    if (isKeep && keep.length < topK) keep.push(entry);
    else if (isReject && reject.length < topK) reject.push(entry);
    if (keep.length >= topK && reject.length >= topK) break;
  }

  return { keep, reject };
}

/**
 * @param {{ similar_reports?: object[], taxonomy_examples?: object[], hfc_snippets?: object[] }} parts
 */
export function formatFieldContextBlock(parts) {
  const lines = [
    '━━━ FIELD REFERENCE CONTEXT (phrasing/disambiguation only) ━━━',
    FIELD_CONTEXT_DISCLAIMER,
    '',
  ];

  if (parts.similar_reports?.length) {
    lines.push('Similar approved field reports:');
    for (const r of parts.similar_reports) {
      lines.push(`- [${r.date ?? ''}] ${r.title ?? r.source_id}: ${r.snippet}`);
    }
    lines.push('');
  }

  if (parts.taxonomy_examples?.length) {
    lines.push('Taxonomy examples (observation vs interpretation):');
    for (const e of parts.taxonomy_examples) {
      lines.push(`- ${e.snippet}`);
    }
    lines.push('');
  }

  if (parts.hfc_snippets?.length) {
    lines.push('HFC guidelines:');
    for (const g of parts.hfc_snippets) {
      lines.push(`- ${g.title ?? ''}: ${g.snippet}`);
    }
    lines.push('');
  }

  if (lines.length <= 4) return '';
  return lines.join('\n');
}

/**
 * @param {string} query batch or post sample
 */
export function formatSocialFewShotBlock({ keep = [], reject = [] }) {
  if (!keep.length && !reject.length) return '';
  const lines = ['FEW-SHOT EXAMPLES (match these patterns):', ''];
  if (keep.length) {
    lines.push('INCLUDE examples:');
    for (const k of keep) lines.push(`+ ${k.snippet}`);
    lines.push('');
  }
  if (reject.length) {
    lines.push('EXCLUDE examples:');
    for (const r of reject) lines.push(`- ${r.snippet}`);
    lines.push('');
  }
  return lines.join('\n');
}

/**
 * @param {object} structuredState
 * @param {Array} turnHistory
 * @param {{ retrievalService?: object, mode?: 'draft'|'analyze' }} deps
 */
export async function buildReportBuildRagContext(structuredState, turnHistory, deps = {}) {
  const empty = {
    similar_reports: [],
    taxonomy_examples: [],
    hfc_snippets: [],
    blockText: '',
  };
  if (!reportBuildRagEnabled()) return empty;

  const retrieval = deps.retrievalService?.retrieval;
  if (!retrieval) return empty;

  const query = buildFieldReportQuery(structuredState, turnHistory);
  const locality = structuredState?.observation?.locality ?? null;
  const reportDate = new Date().toISOString().slice(0, 10);
  const mode = deps.mode ?? 'draft';

  const [taxonomy_examples, hfc_snippets] = await Promise.all([
    retrieveFieldTaxonomyExamples(query, retrieval),
    retrieveHfcGuidelines(query, retrieval),
  ]);

  let similar_reports = [];
  if (mode === 'draft') {
    similar_reports = await retrieveSimilarFieldReports(query, {
      retrieval,
      locality,
      reportDate,
    });
  }

  const blockText = formatFieldContextBlock({
    similar_reports,
    taxonomy_examples,
    hfc_snippets,
  });

  return { similar_reports, taxonomy_examples, hfc_snippets, blockText };
}

/**
 * @param {{ prior_scenes?: object[], place_hints?: string[] }} audioCtx
 */
export function formatAudioSceneContextBlock(audioCtx) {
  if (!audioCtx?.prior_scenes?.length && !audioCtx?.place_hints?.length) return '';
  const lines = [
    'REFERENCE ONLY for scene labeling — do not invent speakers or places not in transcript.',
    '',
  ];
  if (audioCtx.prior_scenes?.length) {
    lines.push('PRIOR SCENES FROM THIS STATION/PROGRAM:');
    for (const s of audioCtx.prior_scenes) {
      lines.push(`- [${s.date ?? ''}] ${s.title ?? ''}: ${s.snippet}`);
    }
    lines.push('');
  }
  if (audioCtx.place_hints?.length) {
    lines.push(`KNOWN PLACE NAMES: ${audioCtx.place_hints.join(', ')}`);
    lines.push('');
  }
  return lines.join('\n');
}
