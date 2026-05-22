/** Platforms with live API fetch adapters (not stub/cache). */
export const LIVE_FETCH_PLATFORMS = Object.freeze(['x', 'telegram_public']);

const UNCONFIGURED_MESSAGES = Object.freeze({
  x: 'X_BEARER_TOKEN is not configured on the server. Set it in .env and restart to run live X fetch from the UI.',
  telegram_public: 'Telegram MTProto is not configured. Set TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION in .env and add channels to business_modules/social_media/telegram-public-channels.json.',
});

/**
 * @param {object[]} posts
 */
function dedupePosts(posts) {
  const seen = new Set();
  const out = [];
  for (const p of posts) {
    const key = p.dedupeKey ?? p.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

/**
 * Routes topic fetch to live platform adapters; merges with stub cache for other platforms.
 *
 * @param {{
 *   xFetchAdapter?: { fetchByTopic: Function } | null,
 *   telegramFetchAdapter?: { fetchByTopic: Function } | null,
 *   stubFetchAdapter: { fetchByTopic: Function },
 * }} deps
 */
export function createSocialMediaCompositeFetchAdapter({
  xFetchAdapter,
  telegramFetchAdapter,
  stubFetchAdapter,
}) {
  if (!stubFetchAdapter) throw new Error('stubFetchAdapter is required');

  const liveAdapters = {
    x: xFetchAdapter ?? null,
    telegram_public: telegramFetchAdapter ?? null,
  };

  return {
    async fetchByTopic(opts) {
      const platforms = opts?.platforms ?? [];
      const liveSelected = platforms.filter((p) => LIVE_FETCH_PLATFORMS.includes(p));
      const stubPlatforms = platforms.filter((p) => !LIVE_FETCH_PLATFORMS.includes(p));

      if (!liveSelected.length) {
        return stubFetchAdapter.fetchByTopic(opts);
      }

      /** @type {object[]} */
      const mergedPosts = [];
      /** @type {string[]} */
      const accessNotes = [];
      /** @type {string[]} */
      const sources = [];
      let mode = opts?.execute ? 'execute' : 'dry_run';
      let dryRun = null;
      let estimate = null;

      for (const platform of liveSelected) {
        const adapter = liveAdapters[platform];
        if (!adapter) {
          sources.push(`${platform}_unconfigured`);
          accessNotes.push(UNCONFIGURED_MESSAGES[platform] ?? `${platform} is not configured.`);
          if (liveSelected.length === 1 && !stubPlatforms.length) {
            return {
              posts: [],
              source: `${platform}_unconfigured`,
              mode: 'dry_run',
              accessNotes,
              dryRun: null,
            };
          }
          continue;
        }

        const result = await adapter.fetchByTopic({ ...opts, platforms: [platform] });
        mergedPosts.push(...(result.posts ?? []));
        sources.push(result.source ?? platform);
        accessNotes.push(...(result.accessNotes ?? []));
        if (result.mode === 'execute') mode = 'execute';
        dryRun = dryRun ?? result.dryRun ?? null;
        estimate = estimate ?? result.estimate ?? result.dryRun?.estimate ?? null;
      }

      let posts = dedupePosts(mergedPosts);
      let source = sources.join('+') || 'live';

      if (stubPlatforms.length) {
        const stubResult = await stubFetchAdapter.fetchByTopic({ ...opts, platforms: stubPlatforms });
        posts = dedupePosts([...posts, ...(stubResult.posts ?? [])]);
        sources.push(stubResult.source ?? 'stub');
        source = sources.join('+');
        accessNotes.push(...(stubResult.accessNotes ?? []));
      }

      return {
        posts,
        source,
        mode,
        accessNotes,
        dryRun,
        estimate,
      };
    },
  };
}
