import { createHash } from 'node:crypto';
import { normalizePlatformSelection, SELECTABLE_PLATFORMS } from '../domain/value_objects/socialPlatform.js';
import { normalizeTopicConcept } from '../domain/services/topicConceptNormalizer.js';
import { translateSocialPosts } from '../../translation/index.js';

function slugifyTopic(topic) {
  const base = String(topic ?? '').trim().toLowerCase().slice(0, 40);
  const hash = createHash('sha256').update(base).digest('hex').slice(0, 8);
  return hash;
}

/**
 * @param {{
 *   persistencePort: import('../domain/ports/ISocialMediaPersistencePort.js').ISocialMediaPersistencePort,
 *   fetchPort: import('../domain/ports/ISocialMediaFetchPort.js').ISocialMediaFetchPort,
 *   translatePosts?: typeof import('../../translation/app/translationService.js').translateSocialPosts,
 * }} deps
 */
export function createSocialMediaTopicFetchService({ persistencePort, fetchPort, translatePosts = translateSocialPosts }) {
  if (!persistencePort) throw new Error('persistencePort is required');
  if (!fetchPort) throw new Error('fetchPort is required');

  return {
    listPlatforms() {
      return { platforms: SELECTABLE_PLATFORMS.map((p) => ({ ...p })) };
    },

    /**
     * @param {{ topic: string, platforms?: string[] }} input
     */
    async fetchByTopic(input) {
      const topic = String(input?.topic ?? '').trim();
      if (!topic || topic.length < 2) {
        throw new Error('topic must be at least 2 characters');
      }

      const topicNormalized = normalizeTopicConcept(topic);

      const platforms = normalizePlatformSelection(input?.platforms);
      const fetched = await fetchPort.fetchByTopic({
        topic,
        platforms,
        execute: Boolean(input?.execute),
        maxPerQuery: input?.maxPerQuery,
        maxCostUsd: input?.maxCostUsd,
      });
      let posts = [];
      let duplicatesRemoved = 0;
      const seen = new Set();
      for (const p of fetched.posts ?? []) {
        const key = p.dedupeKey ?? p.id;
        if (seen.has(key)) {
          duplicatesRemoved += 1;
          continue;
        }
        seen.add(key);
        posts.push(p);
      }

      const lang = String(input?.lang ?? '').trim();
      if (lang && translatePosts) {
        posts = await translatePosts(posts, lang);
      }

      const payload = {
        topic,
        topicNormalized: {
          conceptIds: topicNormalized.conceptIds,
          matchTokens: topicNormalized.matchTokens,
          searchTermsByLang: topicNormalized.searchTermsByLang,
        },
        platforms,
        lang: lang || 'en',
        fetchedAt: new Date().toISOString(),
        source: fetched.source,
        mode: fetched.mode ?? (input?.execute ? 'execute' : 'dry_run'),
        accessNotes: fetched.accessNotes ?? [],
        dryRun: fetched.dryRun ?? null,
        estimate: fetched.estimate ?? fetched.dryRun?.estimate ?? null,
        posts,
        stats: {
          matched: fetched.posts?.length ?? 0,
          afterDedup: posts.length,
          duplicatesRemoved,
        },
      };

      const slug = slugifyTopic(topic);
      const saved = await persistencePort.saveTopicFetch?.(slug, payload);

      return { ...payload, id: saved?.id ?? null };
    },

    listTopicFetchHistory(limit) {
      return persistencePort.listTopicFetches?.(limit) ?? [];
    },

    async getTopicFetch(id, opts = {}) {
      const raw = await persistencePort.loadTopicFetch?.(id) ?? null;
      if (!raw) return null;
      const lang = String(opts.lang ?? '').trim();
      if (lang && translatePosts && Array.isArray(raw.posts) && raw.posts.length) {
        return {
          ...raw,
          lang,
          posts: await translatePosts(raw.posts, lang),
        };
      }
      return raw;
    },
  };
}
