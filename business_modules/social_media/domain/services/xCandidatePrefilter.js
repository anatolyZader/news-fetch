const NEWS_HANDLE_RE = /news|n12|kan|maariv|ynet|walla|mako|jpost|haaretz|globes|calcalist|israelhayom|kikar|srugim|themarker|davar|i24|reshet|reuters|afp|aljazeera/i;
const OFFICIAL_BIO_RE = /journalist|כתב|כתבת|עיתונאי|reporter|correspondent|spokesperson|דובר|דוברת|פיקוד|idf|רשות|משרד|news|editor|anchor|host|presenter/i;

function stripUrlsAndMentions(text) {
  return String(text ?? '')
    .replaceAll(/https?:\/\/\S+/g, '')
    .replaceAll(/@[A-Za-z0-9_]+/g, '')
    .trim();
}

/**
 * @param {object} tweet
 * @param {object} user
 * @param {{ date: string, lang: string }} ctx
 */
export function tweetToCandidate(tweet, user, ctx) {
  const text = String(tweet?.text ?? '');
  const cleaned = stripUrlsAndMentions(text);
  if (cleaned.length < 12) return null;

  const username = String(user?.username ?? '');
  if (NEWS_HANDLE_RE.test(username)) return null;
  if (['business', 'government'].includes(String(user?.verified_type ?? '').toLowerCase())) return null;
  if (OFFICIAL_BIO_RE.test(String(user?.description ?? ''))) return null;

  const metrics = tweet?.public_metrics ?? {};
  return {
    tid: String(tweet.id),
    date: ctx.date,
    lang: ctx.lang,
    text,
    created_at: tweet.created_at ?? null,
    conv: tweet.conversation_id ?? null,
    likes: metrics.like_count ?? 0,
    replies: metrics.reply_count ?? 0,
    quotes: metrics.quote_count ?? 0,
    handle: username,
    user_name: String(user?.name ?? ''),
    bio: String(user?.description ?? '').slice(0, 140),
    user_loc: String(user?.location ?? ''),
    followers: user?.public_metrics?.followers_count ?? 0,
    verified: Boolean(user?.verified),
    url: username ? `https://x.com/${username}/status/${tweet.id}` : null,
  };
}

/**
 * @param {object} raw X search/recent payload
 * @param {{ date: string, lang: string }} ctx
 * @returns {object[]}
 */
export function prefilterXSearchPayload(raw, ctx) {
  const users = raw?.includes?.users ?? [];
  const userById = new Map(users.map((u) => [String(u.id), u]));
  const candidates = [];
  for (const tweet of raw?.data ?? []) {
    const user = userById.get(String(tweet.author_id));
    if (!user) continue;
    const candidate = tweetToCandidate(tweet, user, ctx);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

/**
 * @param {object[]} candidates
 * @param {number} [cap]
 */
export function topXCandidatesByEngagement(candidates, cap = 60) {
  return [...candidates]
    .sort((a, b) => (b.replies + b.likes + b.quotes) - (a.replies + a.likes + a.quotes))
    .slice(0, cap);
}

/**
 * @param {object} candidate
 * @param {string} topic
 */
export function candidateToPost(candidate, topic) {
  const text = String(candidate.text ?? '').trim();
  return {
    id: `x-${candidate.tid}`,
    platform: 'x',
    url: candidate.url ?? '',
    text,
    authorRole: '',
    location: String(candidate.user_loc || 'לא ברור'),
    postedAt: String(candidate.created_at ?? candidate.date ?? ''),
    categoryId: 'other',
    confidence: 'בינונית',
    behaviorOrEmotion: `@${candidate.handle}`,
    replies: [],
    dedupeKey: text.toLowerCase().replaceAll(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 120),
    meta: {
      topic,
      lang: candidate.lang,
      likes: candidate.likes,
      replyCount: candidate.replies,
      handle: candidate.handle,
    },
  };
}
