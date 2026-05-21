import { findingToPost } from '../../domain/services/postNormalizer.js';
import { postMatchesTopic } from '../../domain/services/topicMatcher.js';

/**
 * Stub fetch adapter: searches persisted OSINT findings until live platform APIs are wired.
 *
 * @param {{ persistencePort: import('../domain/ports/ISocialMediaPersistencePort.js').ISocialMediaPersistencePort }} deps
 */
export function createSocialMediaStubFetchAdapter({ persistencePort }) {
  if (!persistencePort) throw new Error('persistencePort is required');

  return {
    async fetchByTopic({ topic, platforms, maxResults = 50 }) {
      const topicText = String(topic ?? '').trim();
      if (!topicText) {
        return { posts: [], source: 'stub', accessNotes: ['Topic is empty.'] };
      }

      const platformSet = new Set(platforms ?? []);
      const dates = persistencePort.listAvailableDates?.() ?? [];
      const posts = [];
      const seen = new Set();

      for (const date of dates) {
        const bundle = await persistencePort.loadBundle(date);
        for (const finding of bundle?.findings ?? []) {
          const post = findingToPost(finding);
          if (platformSet.size && !platformSet.has(post.platform)) continue;
          if (!postMatchesTopic(post, topicText)) continue;
          if (seen.has(post.dedupeKey)) continue;
          seen.add(post.dedupeKey);
          posts.push({ ...post, sourceDate: date });
          if (posts.length >= maxResults) break;
        }
        if (posts.length >= maxResults) break;
      }

      return {
        posts,
        source: 'stub_osint_cache',
        accessNotes: posts.length
          ? ['Results matched from stored OSINT bundles. Live platform APIs are not yet connected.']
          : ['No cached posts matched this topic on the selected platforms. Live fetch APIs are not yet connected.'],
      };
    },
  };
}
