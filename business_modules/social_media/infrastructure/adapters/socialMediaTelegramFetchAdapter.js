import { appendFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadTelegramChannels } from '../../domain/services/telegramChannelRegistry.js';
import {
  candidateToPost,
  prefilterTelegramMessages,
} from '../../domain/services/telegramMessagePrefilter.js';
import { telegramPostMatchesTopic } from '../../domain/services/telegramTopicMatcher.js';
import { isTelegramPostBehaviorEvidence } from '../../domain/services/homefrontBehaviorFilter.js';
import {
  assessmentWindowDates,
  isNorthRelevantText,
} from '../../domain/services/xHomefrontClusterQueries.js';
import {
  topicSlug,
  xSlotEndTime,
  xThreeDayWindow,
  xWindowBounds,
} from '../../domain/services/xTopicQueryBuilder.js';

function appendRawLog(logPath, entry) {
  mkdirSync(resolve(logPath, '..'), { recursive: true });
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

function buildAccessNotes(execute) {
  return [
    execute
      ? 'Live Telegram MTProto channel history fetch (homefront population-behavior filter applied).'
      : 'Dry-run only. Pass execute=true to fetch from configured public channels.',
  ];
}

function buildDryRunPayload(topic, slug, channels, startTime, endTime, dates) {
  return {
    topic,
    slug,
    channels: channels.map((c) => c.username),
    window: { startTime, endTime, dates },
    channelCount: channels.length,
  };
}

function emptyChannelsResult(execute, accessNotes, dryRun) {
  return {
    posts: [],
    source: 'telegram_unconfigured',
    mode: execute ? 'execute' : 'dry_run',
    accessNotes: [
      ...accessNotes,
      'No public channels configured. Add entries to business_modules/social_media/telegram-public-channels.json.',
    ],
    dryRun,
  };
}

function dryRunOnlyResult(accessNotes, dryRun, channels, maxPerChannel, maxTotal, startTime, endTime) {
  return {
    posts: [],
    source: 'telegram_dry_run',
    mode: 'dry_run',
    accessNotes: [
      ...accessNotes,
      `Would scan ${channels.length} public channel(s) over 3-day window.`,
    ],
    dryRun,
    estimate: {
      channelCount: channels.length,
      maxPerChannel,
      maxTotal,
      window: { startTime, endTime },
    },
  };
}

/**
 * @param {object} post
 * @param {string} topic
 * @param {object} channel
 * @param {boolean} dailyMode
 * @param {boolean} north
 */
function passesTelegramFilters(post, topic, channel, dailyMode, north) {
  if (!dailyMode && topic && !telegramPostMatchesTopic(post, topic, channel)) {
    return false;
  }
  if (north && !isNorthRelevantText(post.text, channel)) {
    return false;
  }
  if (dailyMode) {
    return isTelegramPostBehaviorEvidence(post, channel);
  }
  return isTelegramPostBehaviorEvidence(post, channel, { topic });
}

/**
 * @param {object} candidate
 * @param {object} ctx
 */
function tryAcceptCandidate(candidate, ctx) {
  const topicLabel = ctx.dailyMode ? 'daily-homefront' : ctx.topic;
  const post = candidateToPost(candidate, topicLabel);
  if (!passesTelegramFilters(post, ctx.topic, ctx.channel, ctx.dailyMode, ctx.north)) {
    return { accepted: false };
  }
  return { accepted: true, post };
}

async function fetchChannelPosts(channel, ctx) {
  const rawMessages = await ctx.telegramClient.getChannelHistory({
    username: channel.username,
    minDate: ctx.minDate,
    maxDate: ctx.maxDate,
    limit: ctx.maxPerChannel,
  });

  appendRawLog(ctx.rawLogPath, {
    ts: new Date().toISOString(),
    channel: channel.username,
    messageCount: rawMessages.length,
  });

  const posts = [];
  let filteredOut = 0;
  const candidates = prefilterTelegramMessages(rawMessages, channel, { date: ctx.logDate });

  for (const candidate of candidates) {
    const result = tryAcceptCandidate(candidate, { ...ctx, channel });
    if (result.accepted) {
      posts.push(result.post);
    } else {
      filteredOut += 1;
    }
  }
  return { posts, filteredOut };
}

/**
 * @param {{
 *   channels: object[],
 *   telegramClient: object,
 *   topic?: string,
 *   dailyMode?: boolean,
 *   north?: boolean,
 *   minDate: Date,
 *   maxDate: Date,
 *   maxPerChannel: number,
 *   maxTotal: number,
 *   rawLogPath: string,
 *   logDate: string,
 * }} params
 */
async function fetchPostsFromChannels(params) {
  const allPosts = [];
  const channelErrors = [];
  let filteredOut = 0;

  for (const channel of params.channels) {
    if (allPosts.length >= params.maxTotal) break;

    try {
      const { posts, filteredOut: dropped } = await fetchChannelPosts(channel, params);
      filteredOut += dropped;
      for (const post of posts) {
        allPosts.push(post);
        if (allPosts.length >= params.maxTotal) break;
      }
    } catch (err) {
      channelErrors.push({
        channel: channel.username,
        error: err?.message ?? String(err),
      });
    }

    if (params.telegramClient.delayBetweenChannels) {
      await params.telegramClient.delayBetweenChannels();
    }
  }

  return { allPosts, channelErrors, filteredOut };
}

function appendChannelErrors(accessNotes, channelErrors) {
  if (channelErrors.length === 0) return;
  accessNotes.push(
    `Skipped or failed on ${channelErrors.length} channel(s): ${channelErrors.map((e) => e.channel).join(', ')}.`,
  );
}

function appendFilteredNotes(accessNotes, filteredOut, allPosts, template) {
  if (filteredOut <= 0) return;
  const msg = allPosts.length === 0
    ? template.empty(filteredOut)
    : template.excluded(filteredOut);
  accessNotes.push(msg);
}

/**
 * @param {{
 *   telegramClient: { getChannelHistory: Function, delayBetweenChannels?: Function },
 *   persistencePort: import('../../domain/ports/ISocialMediaPersistencePort.js').ISocialMediaPersistencePort,
 *   dataDir?: string,
 *   defaultMaxPerChannel?: number,
 *   defaultMaxTotal?: number,
 *   loadChannels?: (moduleRoot?: string) => import('../../domain/services/telegramChannelRegistry.js').TelegramChannelEntry[],
 * }} deps
 */
export function createSocialMediaTelegramFetchAdapter({
  telegramClient,
  persistencePort,
  dataDir,
  defaultMaxPerChannel = 50,
  defaultMaxTotal = 120,
  loadChannels = loadTelegramChannels,
}) {
  if (!telegramClient) throw new Error('telegramClient is required');
  if (!persistencePort) throw new Error('persistencePort is required');

  const rootDataDir = dataDir ?? persistencePort.dataDir?.() ?? '';

  return {
    async fetchByTopic(opts) {
      const topic = String(opts?.topic ?? '').trim();
      const execute = Boolean(opts?.execute);
      const maxPerChannel = Math.min(Math.max(Number(opts?.maxPerQuery ?? defaultMaxPerChannel), 10), 200);
      const maxTotal = Math.min(Math.max(Number(opts?.maxTotal ?? defaultMaxTotal), 10), 500);
      const slug = topicSlug(topic);
      const { target, dates } = xThreeDayWindow();
      const { startTime, endTime } = xWindowBounds(dates);
      const channels = loadChannels();

      const accessNotes = buildAccessNotes(execute);
      const dryRunPayload = buildDryRunPayload(topic, slug, channels, startTime, endTime, dates);

      if (channels.length === 0) {
        return emptyChannelsResult(execute, accessNotes, dryRunPayload);
      }

      if (!execute) {
        return dryRunOnlyResult(
          accessNotes,
          dryRunPayload,
          channels,
          maxPerChannel,
          maxTotal,
          startTime,
          endTime,
        );
      }

      const rawLogPath = resolve(rootDataDir, `telegram-raw-${target}-${slug}.jsonl`);
      const fetchResult = await fetchPostsFromChannels({
        channels,
        telegramClient,
        topic,
        minDate: new Date(startTime),
        maxDate: new Date(endTime),
        maxPerChannel,
        maxTotal,
        rawLogPath,
        logDate: dates[0],
      });

      appendChannelErrors(accessNotes, fetchResult.channelErrors);
      appendFilteredNotes(accessNotes, fetchResult.filteredOut, fetchResult.allPosts, {
        empty: (n) => `Filtered ${n} message(s) without population-behavior evidence (or north scope).`,
        excluded: (n) => `Excluded ${n} message(s) without population-behavior evidence (or north scope).`,
      });

      return {
        posts: fetchResult.allPosts,
        source: 'telegram_mtproto',
        mode: 'execute',
        accessNotes: [
          ...accessNotes,
          `Kept ${fetchResult.allPosts.length} post(s) with population-behavior evidence from ${channels.length} configured channel(s).`,
        ],
        dryRun: dryRunPayload,
        estimate: {
          channelCount: channels.length,
          postsReturned: fetchResult.allPosts.length,
          filteredOut: fetchResult.filteredOut,
          channelErrors: fetchResult.channelErrors,
          window: { startTime, endTime },
        },
      };
    },

    async fetchDailyEvidence(opts = {}) {
      const execute = Boolean(opts?.execute);
      const north = Boolean(opts?.north);
      const anchorDate = opts?.anchorDate ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
      const days = Math.min(Math.max(Number(opts?.days ?? 3), 1), 14);
      const maxPerChannel = Math.min(Math.max(Number(opts?.maxPerQuery ?? defaultMaxPerChannel), 10), 200);
      const maxTotal = Math.min(Math.max(Number(opts?.maxTotal ?? defaultMaxTotal), 10), 500);
      const dates = assessmentWindowDates(anchorDate, days);
      const oldest = dates.at(-1);
      const newest = dates.at(0);
      const startTime = `${oldest}T00:00:00Z`;
      const endTime = xSlotEndTime(newest);
      const channels = loadChannels();
      const slug = 'daily-homefront';

      const accessNotes = [
        execute
          ? 'Live Telegram MTProto daily homefront fetch (population-behavior filter).'
          : 'Dry-run only. Pass execute=true to fetch from configured public channels.',
      ];
      const dryRun = {
        slug,
        north,
        channels: channels.map((c) => c.username),
        window: { startTime, endTime, dates },
        channelCount: channels.length,
      };

      if (channels.length === 0) {
        return emptyChannelsResult(execute, accessNotes, dryRun);
      }

      if (!execute) {
        return dryRunOnlyResult(
          accessNotes,
          dryRun,
          channels,
          maxPerChannel,
          maxTotal,
          startTime,
          endTime,
        );
      }

      const rawLogPath = resolve(rootDataDir, `telegram-raw-daily-${newest}-${slug}.jsonl`);
      const fetchResult = await fetchPostsFromChannels({
        channels,
        telegramClient,
        dailyMode: true,
        north,
        minDate: new Date(startTime),
        maxDate: new Date(endTime),
        maxPerChannel,
        maxTotal,
        rawLogPath,
        logDate: newest,
      });

      appendChannelErrors(accessNotes, fetchResult.channelErrors);
      if (fetchResult.filteredOut > 0) {
        accessNotes.push(`Excluded ${fetchResult.filteredOut} message(s) (behavior or north filter).`);
      }

      return {
        posts: fetchResult.allPosts,
        source: 'telegram_mtproto_daily',
        mode: 'execute',
        accessNotes: [
          ...accessNotes,
          `Kept ${fetchResult.allPosts.length} daily evidence post(s) from ${channels.length} channel(s).`,
        ],
        dryRun,
        estimate: {
          channelCount: channels.length,
          postsReturned: fetchResult.allPosts.length,
          filteredOut: fetchResult.filteredOut,
          channelErrors: fetchResult.channelErrors,
          window: { startTime, endTime },
        },
      };
    },
  };
}
