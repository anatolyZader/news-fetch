import {
  CATEGORY_LABEL_KEYS,
  EMERGENCY_CATEGORY_IDS,
} from '../domain/value_objects/emergencyCategories.js';
import { findingsToDedupedPosts } from '../domain/services/postNormalizer.js';

/**
 * @param {{ persistencePort: import('../domain/ports/ISocialMediaPersistencePort.js').ISocialMediaPersistencePort }} deps
 */
export function createSocialMediaDailyFeedService({ persistencePort }) {
  if (!persistencePort) throw new Error('persistencePort is required');

  return {
    /**
     * @param {string} date YYYY-MM-DD
     * @param {{ categoryId?: string }} [opts]
     */
    async getDailyFeed(date, opts = {}) {
      const bundle = await persistencePort.loadBundle(date);
      if (!bundle) return null;

      const { posts, duplicatesRemoved } = findingsToDedupedPosts(bundle.findings ?? []);

      const postsByCategory = new Map(EMERGENCY_CATEGORY_IDS.map((id) => [id, []]));
      for (const post of posts) {
        const bucket = postsByCategory.get(post.categoryId) ?? [];
        bucket.push(post);
        postsByCategory.set(post.categoryId, bucket);
      }

      const filterCat = String(opts.categoryId ?? '').trim();
      const categories = EMERGENCY_CATEGORY_IDS.map((id) => ({
        id,
        labelKey: CATEGORY_LABEL_KEYS[id],
        count: (postsByCategory.get(id) ?? []).length,
        posts: filterCat && filterCat !== id ? [] : (postsByCategory.get(id) ?? []),
      })).filter((c) => !filterCat || c.id === filterCat || c.count > 0);

      return {
        date,
        windowStart: bundle.window_start ?? null,
        windowEnd: bundle.window_end ?? null,
        extractedAt: bundle.extracted_at ?? null,
        categories: filterCat
          ? categories.filter((c) => c.id === filterCat)
          : categories.filter((c) => c.count > 0),
        stats: {
          totalRaw: bundle.findings?.length ?? 0,
          afterDedup: posts.length,
          duplicatesRemoved,
        },
        summary: bundle.summary ?? null,
        accessLimitations: bundle.access_limitations ?? [],
      };
    },
  };
}
