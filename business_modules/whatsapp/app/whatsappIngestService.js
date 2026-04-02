/**
 * Orchestrates WhatsApp message ingestion: filter, store, confirm, export.
 */

import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { isAllowedGroup, parseWebhookEntry } from '../domain/services/whatsappMessageFilter.js';

/**
 * @param {{ messageStore, apiAdapter, evidenceStore, allowedGroupIds: string[] }} deps
 */
export function createWhatsAppIngestService({ messageStore, apiAdapter, evidenceStore, allowedGroupIds }) {
  return {
    /**
     * Process a single Meta webhook entry: parse messages, filter, store, and confirm.
     * @param {object} entry  One element from request.body.entry[]
     */
    async handleIncomingMessage(entry) {
      const messages = parseWebhookEntry(entry);

      for (const msg of messages) {
        // Filter: only approved groups
        if (!isAllowedGroup(msg.groupJid, allowedGroupIds)) continue;

        // Dedup: skip if already seen
        if (messageStore.hasMsgId(msg.metaMsgId)) continue;

        // Derive date from Unix timestamp (Israel timezone)
        const msgDate = new Date(Number(msg.timestamp) * 1000);
        const date = msgDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }); // YYYY-MM-DD

        const timestampUtc = msgDate.toISOString();

        // Store in whatsapp_messages table
        const inserted = messageStore.insert({
          metaMsgId: msg.metaMsgId,
          groupJid: msg.groupJid,
          senderPhone: msg.senderPhone,
          senderName: msg.senderName,
          messageText: msg.text,
          timestampUtc,
          date,
        });

        if (!inserted) continue;

        // Also store in evidence_items for cross-module queries
        try {
          evidenceStore.insertItems([{
            date,
            source_type: 'whatsapp',
            source_label: `whatsapp-group`,
            source_url: '',
            title: `WhatsApp: ${msg.senderName || msg.senderPhone} — ${msg.text.slice(0, 60)}`,
            body: msg.text,
            published_at: timestampUtc,
          }]);
        } catch (err) {
          // Dedup index may reject — that's fine
          if (!err.message?.includes('UNIQUE constraint')) throw err;
        }

        // Send confirmation reply to the sender
        try {
          await apiAdapter.sendTextMessage(msg.senderPhone, 'התקבל, תודה');
        } catch (err) {
          console.error(`WhatsApp reply failed for ${msg.senderPhone}:`, err.message);
        }

        console.error(`WhatsApp message ingested: ${msg.metaMsgId} from ${msg.senderName || msg.senderPhone}`);
      }
    },

    /**
     * Export accumulated WhatsApp messages for a date to a markdown file
     * compatible with mdReportsLoader.js.
     * @param {string} date  YYYY-MM-DD
     * @returns {string|null} Path to written file, or null if no messages
     */
    exportToMarkdown(date) {
      const messages = messageStore.getByDate(date);
      if (!messages.length) {
        console.error(`No WhatsApp messages for ${date}`);
        return null;
      }

      const lines = [
        `# WhatsApp group articles (${date})`,
        '',
        `Total: ${messages.length} articles`,
        '',
      ];

      messages.forEach((msg, i) => {
        const senderLabel = msg.sender_name || msg.sender_phone;
        lines.push(`## ${i + 1}. ${senderLabel}: ${msg.message_text.slice(0, 80)}`);
        lines.push('');
        lines.push(`- **URL:** whatsapp://msg/${msg.meta_msg_id}`);
        lines.push(`- **Published:** ${msg.timestamp_utc}`);
        lines.push(`- **Source:** WhatsApp`);
        lines.push('');
        lines.push(msg.message_text);
        lines.push('');
        lines.push('---');
        lines.push('');
      });

      const outPath = resolve(`articles-whatsapp-${date}.md`);
      writeFileSync(outPath, lines.join('\n'), 'utf-8');
      console.error(`Wrote ${messages.length} WhatsApp messages to ${outPath}`);
      return outPath;
    },
  };
}
