const MIN_MESSAGE_LENGTH = 8;

function normalizeDedupeKey(text) {
  return String(text ?? '')
    .toLowerCase()
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .slice(0, 120);
}

/**
 * @param {import('./telegramChannelRegistry.js').TelegramChannelEntry} channel
 */
function channelMetadata(channel) {
  return {
    sourceId: channel.id ?? null,
    sourceCategory: channel.sourceCategory ?? null,
    sourceType: channel.sourceType ?? null,
    citizenVoiceLevel: channel.citizenVoiceLevel ?? null,
    emergencyResearchValue: channel.emergencyResearchValue ?? null,
    accessStatus: channel.accessStatus ?? null,
    coverageArea: channel.coverageArea ?? [],
    exampleSearchTerms: channel.exampleSearchTerms ?? [],
    collectionNotes: channel.collectionNotes ?? null,
  };
}

/**
 * @param {object} message Raw MTProto message
 * @param {import('./telegramChannelRegistry.js').TelegramChannelEntry} channel
 * @param {{ date: string }} ctx
 */
export function messageToCandidate(message, channel, ctx) {
  if (channel.collectEnabled === false) return null;

  const text = String(message?.message ?? message?.text ?? '').trim();
  if (text.length < MIN_MESSAGE_LENGTH) return null;

  const messageId = message?.id ?? message?.messageId;
  if (messageId == null) return null;

  const dateSec = message?.date ?? message?.postedAt;
  const postedAt = typeof dateSec === 'number'
    ? new Date(dateSec * 1000).toISOString()
    : String(dateSec ?? ctx.date);

  return {
    messageId: String(messageId),
    date: ctx.date,
    text,
    postedAt,
    username: channel.username,
    channelTitle: String(channel.title ?? channel.username),
    locality: String(channel.locality ?? ''),
    lang: channel.lang ?? null,
    views: message?.views ?? null,
    url: `https://t.me/${channel.username}/${messageId}`,
    ...channelMetadata(channel),
  };
}

/**
 * @param {object} candidate
 * @param {string} topic
 */
export function candidateToPost(candidate, topic) {
  const text = String(candidate.text ?? '').trim();
  return {
    id: `telegram-${candidate.username}-${candidate.messageId}`,
    platform: 'telegram_public',
    url: candidate.url ?? '',
    text,
    authorRole: '',
    location: String(candidate.locality || 'לא ברור'),
    postedAt: String(candidate.postedAt ?? candidate.date ?? ''),
    categoryId: 'other',
    confidence: 'בינונית',
    behaviorOrEmotion: candidate.channelTitle,
    replies: [],
    dedupeKey: normalizeDedupeKey(text),
    meta: {
      topic,
      channel: candidate.username,
      lang: candidate.lang,
      views: candidate.views,
      sourceId: candidate.sourceId ?? null,
      sourceCategory: candidate.sourceCategory ?? null,
      sourceType: candidate.sourceType ?? null,
      citizenVoiceLevel: candidate.citizenVoiceLevel ?? null,
      emergencyResearchValue: candidate.emergencyResearchValue ?? null,
      accessStatus: candidate.accessStatus ?? null,
      coverageArea: candidate.coverageArea ?? [],
      collectionNotes: candidate.collectionNotes ?? null,
      homefrontBehaviorEvidence: true,
    },
  };
}

/**
 * @param {object[]} messages
 * @param {import('./telegramChannelRegistry.js').TelegramChannelEntry} channel
 * @param {{ date: string }} ctx
 * @returns {object[]}
 */
export function prefilterTelegramMessages(messages, channel, ctx) {
  const candidates = [];
  for (const message of messages ?? []) {
    const candidate = messageToCandidate(message, channel, ctx);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}
