/**
 * WhatsApp Business Cloud API adapter.
 * Handles webhook verification and outbound message sending via Meta Graph API.
 */

const GRAPH_API_VERSION = 'v21.0';
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * @param {{ accessToken: string, phoneNumberId: string }} opts
 */
export function createMetaCloudApiAdapter({ accessToken, phoneNumberId }) {
  return {
    /**
     * Verify Meta webhook subscription (GET handler).
     * @returns {{ ok: boolean, challenge?: string }}
     */
    verifyWebhook(mode, token, challenge, verifyToken) {
      if (mode === 'subscribe' && token === verifyToken) {
        return { ok: true, challenge };
      }
      return { ok: false };
    },

    /**
     * Send a text message via WhatsApp Cloud API.
     * @param {string} to  Recipient phone number or group JID
     * @param {string} text  Message body
     */
    async sendTextMessage(to, text) {
      const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: text },
        }),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`WhatsApp send failed (${res.status}): ${body}`);
      }
    },
  };
}
