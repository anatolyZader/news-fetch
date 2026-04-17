/**
 * Normalizes raw parsed webhook messages into a clean domain model.
 * Extracts button/list reply IDs, text commands, and media info uniformly.
 */

/**
 * @typedef {object} NormalizedInbound
 * @property {string} phoneNumber
 * @property {string} displayName
 * @property {string} metaMsgId
 * @property {string} timestamp
 * @property {'text'|'button_reply'|'list_reply'|'media'|'unknown'} type
 * @property {string|null} text
 * @property {string|null} buttonReplyId
 * @property {string|null} listReplyId
 * @property {string|null} mediaType
 * @property {boolean} isDm
 */

/**
 * Normalize a raw parsed message from parseWebhookEntry into a clean model.
 * @param {object} raw  Output of parseWebhookEntry (one element)
 * @param {object} rawMessage  The original Meta message object (for interactive fields)
 * @returns {NormalizedInbound}
 */
export function normalizeInboundMessage(raw, rawMessage) {
  const base = {
    phoneNumber: raw.senderPhone,
    displayName: raw.senderName,
    metaMsgId: raw.metaMsgId,
    timestamp: raw.timestamp,
    text: null,
    buttonReplyId: null,
    listReplyId: null,
    mediaType: null,
    isDm: !raw.groupJid,
  };

  // Interactive button reply
  if (rawMessage?.type === 'interactive' && rawMessage.interactive?.type === 'button_reply') {
    return {
      ...base,
      type: 'button_reply',
      text: rawMessage.interactive.button_reply?.title ?? null,
      buttonReplyId: rawMessage.interactive.button_reply?.id ?? null,
    };
  }

  // Interactive list reply
  if (rawMessage?.type === 'interactive' && rawMessage.interactive?.type === 'list_reply') {
    return {
      ...base,
      type: 'list_reply',
      text: rawMessage.interactive.list_reply?.title ?? null,
      listReplyId: rawMessage.interactive.list_reply?.id ?? null,
    };
  }

  // Text message
  if (raw.type === 'text') {
    return { ...base, type: 'text', text: raw.text };
  }

  // Media with caption
  if (raw.type?.endsWith('_caption')) {
    const mediaKind = raw.type.replace('_caption', '');
    return { ...base, type: 'media', text: raw.text, mediaType: mediaKind };
  }

  // Media without caption (raw message has media type but extractTextContent returned null)
  if (rawMessage && ['image', 'video', 'document', 'audio'].includes(rawMessage.type)) {
    return { ...base, type: 'media', mediaType: rawMessage.type };
  }

  return { ...base, type: 'unknown' };
}
