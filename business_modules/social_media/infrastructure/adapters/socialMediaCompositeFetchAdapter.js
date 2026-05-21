/**
 * Routes topic fetch to X when selected; merges with stub cache for other platforms.
 *
 * @param {{
 *   xFetchAdapter?: { fetchByTopic: Function } | null,
 *   stubFetchAdapter: { fetchByTopic: Function },
 * }} deps
 */
export function createSocialMediaCompositeFetchAdapter({ xFetchAdapter, stubFetchAdapter }) {
  if (!stubFetchAdapter) throw new Error('stubFetchAdapter is required');

  return {
    async fetchByTopic(opts) {
      const platforms = opts?.platforms ?? [];
      const hasX = platforms.includes('x');
      const otherPlatforms = platforms.filter((p) => p !== 'x');

      if (!hasX) {
        return stubFetchAdapter.fetchByTopic(opts);
      }

      if (!xFetchAdapter) {
        if (!otherPlatforms.length) {
          return {
            posts: [],
            source: 'x_unconfigured',
            mode: 'dry_run',
            accessNotes: [
              'X_BEARER_TOKEN is not configured on the server. Set it in .env and restart to run /x-3 from the UI.',
            ],
            dryRun: null,
          };
        }
        return stubFetchAdapter.fetchByTopic({ ...opts, platforms: otherPlatforms });
      }

      const xResult = await xFetchAdapter.fetchByTopic({ ...opts, platforms: ['x'] });

      if (!otherPlatforms.length) {
        return xResult;
      }

      const stubResult = await stubFetchAdapter.fetchByTopic({ ...opts, platforms: otherPlatforms });
      const seen = new Set();
      const posts = [];
      for (const p of [...(xResult.posts ?? []), ...(stubResult.posts ?? [])]) {
        const key = p.dedupeKey ?? p.id;
        if (seen.has(key)) continue;
        seen.add(key);
        posts.push(p);
      }

      return {
        posts,
        source: 'x_api_v2+stub',
        mode: xResult.mode,
        accessNotes: [
          ...(xResult.accessNotes ?? []),
          ...(stubResult.accessNotes ?? []),
        ],
        dryRun: xResult.dryRun,
        estimate: xResult.estimate,
      };
    },
  };
}
