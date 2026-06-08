import { findingToPost } from '../../domain/services/postNormalizer.js';
import { postMatchesTopic } from '../../domain/services/topicMatcher.js';

/**
 * @param {object} finding
 * @param {string} date
 * @param {string} topicText
 * @param {Set<string>} platformSet
 * @param {Set<string>} seen
 */
function tryMatchFinding(finding, date, topicText, platformSet, seen) {
  const post = findingToPost(finding);
  if (platformSet.size && !platformSet.has(post.platform)) return null;
  if (!postMatchesTopic(post, topicText)) return null;
  if (seen.has(post.dedupeKey)) return null;
  seen.add(post.dedupeKey);
  return { ...post, sourceDate: date };
}

/**
 * @param {import('../domain/ports/ISocialMediaPersistencePort.js').ISocialMediaPersistencePort} persistencePort
 * @param {string} topicText
 * @param {Set<string>} platformSet
 * @param {number} maxResults
 */
async function collectPostsFromBundles(persistencePort, topicText, platformSet, maxResults) {
  const dates = persistencePort.listAvailableDates?.() ?? [];
  const posts = [];
  const seen = new Set();

  for (const date of dates) {
    const bundle = await persistencePort.loadBundle(date);
    for (const finding of bundle?.findings ?? []) {
      const matched = tryMatchFinding(finding, date, topicText, platformSet, seen);
      if (matched) posts.push(matched);
      if (posts.length >= maxResults) return posts;
    }
  }
  return posts;
}

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
      const posts = await collectPostsFromBundles(persistencePort, topicText, platformSet, maxResults);

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
