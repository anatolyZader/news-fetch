/**
 * Parses an Apify Facebook Groups Scraper JSON export.
 *
 * Apify output is an array of post objects. Key fields used:
 *   postText      — post content
 *   publishedAt   — ISO timestamp
 *   groupName     — Facebook group name (used as municipality identifier)
 *   likeCount     — engagement signal
 *   commentCount  — engagement signal
 *
 * Field name variations across Apify actor versions are handled by resolve*() helpers.
 *
 * Returns:
 *   {
 *     posts:          [{ id, text, publishedAt, groupName, likeCount, commentCount, url }],
 *     totalPosts:     N,
 *     filteredPosts:  N,
 *     municipalities: [{ name, posts: [...] }]
 *   }
 */

import { readFileSync } from 'fs';
import { isHomefrontRelevant } from '../../business_modules/news-sites/domain/homefrontKeywords.js';

const MAX_POST_CHARS = 800;

// ─── Field resolvers (handle Apify actor version differences) ─────────────────

function resolveText(p)       { return p.postText ?? p.text ?? p.message ?? p.body ?? ''; }
function resolveDate(p)       { return p.publishedAt ?? p.timestamp ?? p.time ?? p.date ?? ''; }
function resolveGroup(p)      { return p.groupName ?? p.group?.name ?? p.groupTitle ?? ''; }
function resolveLikes(p)      { return p.likeCount ?? p.likesCount ?? p.likes ?? 0; }
function resolveComments(p)   { return p.commentCount ?? p.commentsCount ?? p.comments ?? 0; }
function resolveUrl(p)        { return p.postUrl ?? p.url ?? p.link ?? ''; }
function resolveId(p)         { return p.postId ?? p.id ?? resolveUrl(p) ?? String(Math.random()); }

// ─── Main loader ──────────────────────────────────────────────────────────────

/**
 * @param {string} filePath         Path to Apify JSON export
 * @param {string} [municipalityOverride]  If set, use this name for all posts
 *                                         (when the JSON covers a single group)
 * @returns {{ posts, totalPosts, filteredPosts, municipalities }}
 */
export function parseSocialMediaJson(filePath, municipalityOverride) {
  const raw = JSON.parse(readFileSync(filePath, 'utf-8'));
  const items = Array.isArray(raw) ? raw : raw.items ?? raw.data ?? raw.posts ?? [];

  if (items.length === 0) throw new Error('No posts found in JSON file');

  const allPosts = items.map((p) => ({
    id:          resolveId(p),
    text:        resolveText(p).trim().slice(0, MAX_POST_CHARS),
    publishedAt: resolveDate(p),
    groupName:   municipalityOverride ?? resolveGroup(p) ?? 'unknown',
    likeCount:   resolveLikes(p),
    commentCount: resolveComments(p),
    url:         resolveUrl(p),
  })).filter((p) => p.text.length > 0);

  // Filter for homefront / emergency relevance
  const filtered = allPosts.filter((p) => isHomefrontRelevant('', p.text));

  if (filtered.length === 0) {
    console.error(`  ⚠ No homefront-relevant posts found among ${allPosts.length} total posts`);
  }

  // Group by municipality
  const munMap = new Map();
  for (const post of filtered) {
    const name = post.groupName;
    if (!munMap.has(name)) munMap.set(name, []);
    munMap.get(name).push(post);
  }

  const municipalities = Array.from(munMap.entries()).map(([name, posts]) => ({ name, posts }));

  return {
    posts: filtered,
    totalPosts: allPosts.length,
    filteredPosts: filtered.length,
    municipalities,
  };
}
