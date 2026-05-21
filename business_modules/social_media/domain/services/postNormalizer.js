import { categorizeFinding } from './findingCategorizer.js';

function normalizeDedupeKey(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * @param {object} finding OSINT finding
 * @returns {object} normalized post
 */
export function findingToPost(finding) {
  const text = String(finding?.quote_original ?? '').trim();
  return {
    id: String(finding?.id ?? finding?.url ?? normalizeDedupeKey(text)),
    platform: String(finding?.platform ?? ''),
    url: String(finding?.url ?? ''),
    text,
    authorRole: String(finding?.speaker_role ?? ''),
    location: String(finding?.location ?? ''),
    postedAt: String(finding?.date ?? ''),
    categoryId: categorizeFinding(finding),
    confidence: String(finding?.confidence ?? ''),
    behaviorOrEmotion: String(finding?.behavior_or_emotion ?? ''),
    replies: Array.isArray(finding?.replies) ? finding.replies : [],
    dedupeKey: normalizeDedupeKey(text),
  };
}

/**
 * @param {object[]} findings
 * @returns {{ posts: object[], duplicatesRemoved: number }}
 */
export function findingsToDedupedPosts(findings) {
  const seen = new Set();
  const posts = [];
  let duplicatesRemoved = 0;

  for (const finding of findings ?? []) {
    const post = findingToPost(finding);
    if (!post.text) continue;
    if (seen.has(post.dedupeKey)) {
      duplicatesRemoved += 1;
      continue;
    }
    seen.add(post.dedupeKey);
    posts.push(post);
  }

  return { posts, duplicatesRemoved };
}
