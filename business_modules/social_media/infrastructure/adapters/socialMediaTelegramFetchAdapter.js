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
  topicSlug,
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

async function fetchPostsFromChannels({
  channels,
  telegramClient,
  topic,
  minDate,
  maxDate,
  maxPerChannel,
  maxTotal,
  rawLogPath,
  dates,
}) {
  /** @type {object[]} */
  const allPosts = [];
  const channelErrors = [];
  let topicMatchedOnly = 0;

  for (const channel of channels) {
    if (allPosts.length >= maxTotal) break;

    try {
      const rawMessages = await telegramClient.getChannelHistory({
        username: channel.username,
        minDate,
        maxDate,
        limit: maxPerChannel,
      });

      appendRawLog(rawLogPath, {
        ts: new Date().toISOString(),
        channel: channel.username,
        messageCount: rawMessages.length,
      });

      const candidates = prefilterTelegramMessages(rawMessages, channel, { date: dates[0] });
      for (const candidate of candidates) {
        const post = candidateToPost(candidate, topic);
        if (!telegramPostMatchesTopic(post, topic, channel)) continue;
        if (!isTelegramPostBehaviorEvidence(post, channel, { topic })) {
          topicMatchedOnly += 1;
          continue;
        }
        allPosts.push(post);
        if (allPosts.length >= maxTotal) break;
      }
    } catch (err) {
      channelErrors.push({
        channel: channel.username,
        error: err?.message ?? String(err),
      });
    }

    if (telegramClient.delayBetweenChannels) {
      await telegramClient.delayBetweenChannels();
    }
  }

  return { allPosts, channelErrors, topicMatchedOnly };
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
      const minDate = new Date(startTime);
      const maxDate = new Date(endTime);
      const channels = loadChannels();

      const accessNotes = buildAccessNotes(execute);
      const dryRunPayload = buildDryRunPayload(topic, slug, channels, startTime, endTime, dates);

      if (!channels.length) {
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
      const { allPosts, channelErrors, topicMatchedOnly } = await fetchPostsFromChannels({
        channels,
        telegramClient,
        topic,
        minDate,
        maxDate,
        maxPerChannel,
        maxTotal,
        rawLogPath,
        dates,
      });

      if (channelErrors.length) {
        accessNotes.push(
          `Skipped or failed on ${channelErrors.length} channel(s): ${channelErrors.map((e) => e.channel).join(', ')}.`,
        );
      }

      if (topicMatchedOnly > 0) {
        accessNotes.push(
          allPosts.length === 0
            ? `Found ${topicMatchedOnly} topic match(es) on UAV/alerts, but all were attack/siren templates without population-behavior evidence (sheltering, fear, resident reports, compliance).`
            : `Excluded ${topicMatchedOnly} topic match(es) that lacked population-behavior evidence.`,
        );
      }

      return {
        posts: allPosts,
        source: 'telegram_mtproto',
        mode: 'execute',
        accessNotes: [
          ...accessNotes,
          `Kept ${allPosts.length} post(s) with population-behavior evidence from ${channels.length} configured channel(s).`,
        ],
        dryRun: dryRunPayload,
        estimate: {
          channelCount: channels.length,
          postsReturned: allPosts.length,
          topicMatchedOnly,
          channelErrors,
          window: { startTime, endTime },
        },
      };
    },
  };
}
