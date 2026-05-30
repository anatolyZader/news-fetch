import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { isHomefrontBehaviorRelevant } from '../domain/services/homefrontBehaviorFilter.js';
import {
  assessmentWindowDates,
  buildDailyXSearchSlots,
} from '../domain/services/xHomefrontClusterQueries.js';
import {
  groupFindingsByDate,
  isBundleFreshForRun,
  mergeFindingsIntoBundle,
} from '../domain/services/osintBundleMerge.js';
import {
  candidateToPost,
  prefilterXSearchPayload,
  topXCandidatesByEngagement,
} from '../domain/services/xCandidatePrefilter.js';
import {
  classifySocialCandidates,
  postsToClassifierCandidates,
} from './socialCandidateClassifier.js';

const COUNTS_COST = 0.005;
const POST_COST = 0.005;

/**
 * @param {{
 *   persistencePort: import('../domain/ports/ISocialMediaPersistencePort.js').ISocialMediaPersistencePort,
 *   gatherService: ReturnType<import('./socialMediaGatherService.js').createSocialMediaGatherService>,
 *   treatmentService: ReturnType<import('./socialMediaTreatmentService.js').createSocialMediaTreatmentService>,
 *   xApiClient?: { countsRecent: Function, searchRecent: Function } | null,
 *   telegramFetchAdapter?: { fetchDailyEvidence: Function } | null,
 *   dataDir?: string,
 *   defaultMaxPerQuery?: number,
 *   defaultMaxCostUsd?: number,
 *   candidateCap?: number,
 *   classifyCandidates?: typeof import('./socialCandidateClassifier.js').classifySocialCandidates,
 *   retrievalService?: object|null,
 * }} deps
 */
export function createSocialMediaDailyGatherService({
  persistencePort,
  gatherService,
  treatmentService,
  xApiClient = null,
  telegramFetchAdapter = null,
  dataDir,
  defaultMaxPerQuery = 50,
  defaultMaxCostUsd = 5,
  candidateCap = 100,
  classifyCandidates = classifySocialCandidates,
  retrievalService = null,
}) {
  if (!persistencePort) throw new Error('persistencePort is required');
  if (!gatherService) throw new Error('gatherService is required');
  if (!treatmentService) throw new Error('treatmentService is required');

  const rootDataDir = dataDir ?? persistencePort.dataDir?.() ?? '';

  async function gatherX({ anchorDate, days, north, execute, maxPerQuery, maxCostUsd }) {
    const slots = buildDailyXSearchSlots({ anchorDate, days, north });
    const accessNotes = [];
    const candidates = [];
    let countsCost = 0;
    let searchCost = 0;

    const countRows = [];
    for (const slot of slots) {
      const body = await xApiClient.countsRecent({
        query: slot.query,
        startTime: slot.startTime,
        endTime: slot.endTime,
      });
      countsCost += COUNTS_COST;
      countRows.push({ ...slot, result_count: body?.meta?.total_tweet_count ?? 0 });
    }

    const projectedPosts = countRows.reduce(
      (sum, row) => sum + Math.min(row.result_count, maxPerQuery),
      0,
    );
    const estTotal = countsCost + projectedPosts * POST_COST;

    accessNotes.push(
      execute
        ? `X daily gather (${slots.length} count slots, ~$${estTotal.toFixed(2)} projected).`
        : `X dry-run: ${slots.length} count slots, est. $${estTotal.toFixed(2)} if executed.`,
    );

    if (estTotal > maxCostUsd) {
      throw new Error(
        `Estimated X API cost $${estTotal.toFixed(2)} exceeds max $${maxCostUsd.toFixed(2)}.`,
      );
    }

    if (!execute) {
      return {
        posts: [],
        candidateCount: projectedPosts,
        estCost: estTotal,
        accessNotes,
        aborted: false,
      };
    }

    for (const row of countRows) {
      if (row.result_count <= 0) continue;
      const raw = await xApiClient.searchRecent({
        query: row.query,
        startTime: row.startTime,
        endTime: row.endTime,
        maxResults: maxPerQuery,
      });
      searchCost += (raw?.data?.length ?? 0) * POST_COST;

      const rawPath = resolve(
        rootDataDir,
        `x-raw-daily-${row.date}-${row.lang}-${row.cluster}.json`,
      );
      mkdirSync(resolve(rawPath, '..'), { recursive: true });
      writeFileSync(rawPath, `${JSON.stringify(raw, null, 2)}\n`, 'utf8');
      candidates.push(...prefilterXSearchPayload(raw, { date: row.date, lang: row.lang }));
    }

    const posts = topXCandidatesByEngagement(candidates, candidateCap)
      .filter((c) => isHomefrontBehaviorRelevant(c.text ?? ''))
      .map((c) => candidateToPost(c, 'daily-homefront'));

    return {
      posts,
      candidateCount: candidates.length,
      estCost: countsCost + searchCost,
      accessNotes,
      aborted: false,
    };
  }

  async function fetchXPosts(ctx) {
    if (!xApiClient) {
      return { posts: [], notes: ['X_BEARER_TOKEN is not configured — skipped X fetch.'], aborted: false, xCandidates: 0, estXCost: 0 };
    }
    const xResult = await gatherX(ctx);
    return {
      posts: xResult.posts,
      notes: xResult.accessNotes,
      aborted: xResult.aborted,
      xCandidates: xResult.candidateCount,
      estXCost: xResult.estCost,
    };
  }

  async function fetchTelegramPosts(ctx) {
    const fetchDaily = telegramFetchAdapter?.fetchDailyEvidence;
    if (!fetchDaily) {
      return { posts: [], notes: ['Telegram MTProto is not configured — skipped Telegram fetch.'], telegramPosts: 0 };
    }
    const tg = await fetchDaily({
      execute: ctx.execute,
      north: ctx.north,
      anchorDate: ctx.anchorDate,
      days: ctx.days,
      maxPerQuery: ctx.maxPerQuery,
      maxTotal: Math.min(ctx.maxPerQuery * 3, 120),
    });
    const posts = tg.posts?.length ? tg.posts : [];
    return { posts, notes: tg.accessNotes ?? [], telegramPosts: posts.length };
  }

  async function persistFindings(ctx) {
    const { findings, rejected, rejected_examples } = await classifyCandidates(
      postsToClassifierCandidates(ctx.behaviorPosts),
      { retrieval: retrievalService?.retrieval ?? null },
    );
    const byDate = groupFindingsByDate(findings);
    const bundlePaths = [];
    const treatedDates = [];
    const accessNotes = [];

    for (const date of ctx.windowDates) {
      const dayFindings = byDate.get(date) ?? [];
      const shouldPersist = dayFindings.length > 0 || ctx.datesToGather.includes(date);
      if (!shouldPersist) continue;

      let bundle = await persistencePort.loadBundle(date);
      if (!bundle) {
        bundle = gatherService.createEmptyBundle({ date, windowDays: 1 });
        bundle.window_start = date;
        bundle.window_end = date;
        bundle.platforms_searched = [...ctx.platforms];
      }

      const merged = mergeFindingsIntoBundle(bundle, dayFindings);
      const priorRejected = merged.rejected;
      merged.rejected = priorRejected ? { ...priorRejected, ...rejected } : { ...rejected };
      merged.rejected_examples = [...(merged.rejected_examples ?? []), ...rejected_examples];
      if (ctx.platforms.includes('x')) {
        merged.queries_executed = (merged.queries_executed ?? 0)
          + buildDailyXSearchSlots({ anchorDate: date, days: 1, north: ctx.north }).length;
      }

      const { path } = await persistencePort.saveBundle(date, merged);
      bundlePaths.push(path);

      try {
        await treatmentService.treatAndSave(date);
        treatedDates.push(date);
      } catch (err) {
        accessNotes.push(`treat failed for ${date}: ${err?.message ?? err}`);
      }
    }

    return { bundlePaths, treatedDates, accessNotes, findingsCount: findings.length };
  }

  async function gatherDaily(input) {
    const anchorDate = String(input?.date ?? '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
      throw new Error('date must be YYYY-MM-DD');
    }

    const days = Math.min(Math.max(Number(input?.days ?? 3), 1), 14);
    const north = Boolean(input?.north);
    const execute = Boolean(input?.execute);
    const force = Boolean(input?.force);
    const maxPerQuery = Math.min(Math.max(Number(input?.maxPerQuery ?? defaultMaxPerQuery), 10), 100);
    const maxCostUsd = Number(input?.maxCostUsd ?? defaultMaxCostUsd);
    const runDate = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
    const windowDates = assessmentWindowDates(anchorDate, days);
    const platforms = normalizePlatforms(input?.platforms);

    const { skippedDates, datesToGather } = await planDatesToGather(
      persistencePort,
      windowDates,
      runDate,
      force,
    );

    if (datesToGather.length === 0 && !force) {
      return buildResult({
        mode: 'reuse',
        anchorDate,
        days,
        north,
        skippedDates,
        accessNotes: ['All window dates have fresh social bundles — reused.'],
        bundlePaths: [],
        treatedDates: [],
      });
    }

    const fetchCtx = { anchorDate, days, north, execute, maxPerQuery, maxCostUsd };
    const accessNotes = [];
    let allPosts = [];
    let xCandidates = 0;
    let telegramPosts = 0;
    let estXCost = 0;

    if (platforms.includes('x')) {
      const x = await fetchXPosts(fetchCtx);
      accessNotes.push(...x.notes);
      allPosts = allPosts.concat(x.posts);
      xCandidates = x.xCandidates;
      estXCost = x.estXCost;
      if (x.aborted) {
        return buildResult({
          mode: execute ? 'aborted' : 'dry_run',
          anchorDate,
          days,
          north,
          skippedDates,
          accessNotes,
          bundlePaths: [],
          treatedDates: [],
          xCandidates,
          telegramPosts,
          estXCost,
        });
      }
    }

    if (platforms.includes('telegram_public')) {
      const tg = await fetchTelegramPosts(fetchCtx);
      accessNotes.push(...tg.notes);
      allPosts = allPosts.concat(tg.posts);
      telegramPosts = tg.telegramPosts;
    }

    if (!execute) {
      accessNotes.push(`Dry-run: ${allPosts.length} post(s) would be classified (X est. $${estXCost.toFixed(2)}).`);
      return buildResult({
        mode: 'dry_run',
        anchorDate,
        days,
        north,
        skippedDates,
        accessNotes,
        bundlePaths: [],
        treatedDates: [],
        xCandidates,
        telegramPosts,
        estXCost,
        candidateCount: allPosts.length,
      });
    }

    const behaviorPosts = allPosts.filter((p) => isHomefrontBehaviorRelevant(p.text ?? '')).slice(0, candidateCap);
    const saved = await persistFindings({
      behaviorPosts,
      windowDates,
      datesToGather,
      platforms,
      north,
    });

    return buildResult({
      mode: 'execute',
      anchorDate,
      days,
      north,
      skippedDates,
      accessNotes: [...accessNotes, ...saved.accessNotes],
      bundlePaths: saved.bundlePaths,
      treatedDates: saved.treatedDates,
      xCandidates,
      telegramPosts,
      estXCost,
      findingsCount: saved.findingsCount,
    });
  }

  return { gatherDaily };
}

async function planDatesToGather(persistencePort, windowDates, runDate, force) {
  const skippedDates = [];
  const datesToGather = [];
  for (const d of windowDates) {
    const existing = await persistencePort.loadBundle(d);
    const fresh = existing && isBundleFreshForRun(existing, runDate);
    if (fresh && !force) {
      skippedDates.push(d);
    } else {
      datesToGather.push(d);
    }
  }
  return { skippedDates, datesToGather };
}

function normalizePlatforms(platforms) {
  const allowed = new Set(['x', 'telegram_public']);
  const out = [];
  for (const p of platforms ?? ['x', 'telegram_public']) {
    const id = String(p ?? '').trim();
    if (allowed.has(id) && !out.includes(id)) out.push(id);
  }
  return out.length ? out : ['x', 'telegram_public'];
}

function buildResult(fields) {
  return { ...fields };
}
