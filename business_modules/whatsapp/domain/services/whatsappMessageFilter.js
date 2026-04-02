/**
 * Pure domain functions for filtering and parsing WhatsApp webhook messages.
 */

/**
 * Check if a message's group JID is in the approved allowlist.
 * @param {string|undefined} groupJid  The group JID from the webhook (e.g. "120363...@g.us")
 * @param {string[]} allowedGroupIds   Configured allowlist
 * @returns {boolean}
 */
export function isAllowedGroup(groupJid, allowedGroupIds) {
  if (!allowedGroupIds.length) return true; // No allowlist = accept all
  if (!groupJid) return false; // Not from a group = reject
  return allowedGroupIds.includes(groupJid);
}

/**
 * Extract text content from a Meta Cloud API webhook message object.
 * Handles text messages and media captions.
 * @param {object} message  The message object from entry.changes[].value.messages[]
 * @returns {{ text: string, type: string } | null}
 */
export function extractTextContent(message) {
  if (!message) return null;

  if (message.type === 'text' && message.text?.body) {
    return { text: message.text.body, type: 'text' };
  }

  // Media messages may have captions
  for (const mediaType of ['image', 'video', 'document']) {
    if (message.type === mediaType && message[mediaType]?.caption) {
      return { text: message[mediaType].caption, type: `${mediaType}_caption` };
    }
  }

  return null;
}

/**
 * Parse a Meta webhook entry into individual message records.
 * @param {object} entry  One element from request.body.entry[]
 * @returns {Array<{ metaMsgId: string, groupJid: string|undefined, senderPhone: string, senderName: string, text: string, type: string, timestamp: string }>}
 */
export function parseWebhookEntry(entry) {
  const results = [];

  for (const change of entry?.changes ?? []) {
    const value = change?.value;
    if (value?.messaging_product !== 'whatsapp') continue;

    const contacts = value.contacts ?? [];
    const contactMap = Object.fromEntries(contacts.map((c) => [c.wa_id, c.profile?.name ?? '']));

    for (const msg of value.messages ?? []) {
      const extracted = extractTextContent(msg);
      if (!extracted) continue;

      // Group context: msg.context or the metadata indicates group
      // In WhatsApp Cloud API, group messages have msg.from as sender
      // and the group JID is not directly in the message — it's in metadata
      // For group messages via Cloud API, we check value.metadata or msg fields
      const groupJid = msg.group_id ?? value.metadata?.group_id ?? undefined;

      results.push({
        metaMsgId: msg.id,
        groupJid,
        senderPhone: msg.from,
        senderName: contactMap[msg.from] ?? '',
        text: extracted.text,
        type: extracted.type,
        timestamp: msg.timestamp,
      });
    }
  }

  return results;
}
