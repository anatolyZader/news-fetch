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
     * @returns {{ ok: boolean }}
     */
    async sendTextMessage(to, text) {
      return this.sendMessage(to, { type: 'text', body: text });
    },

    /**
     * Send a typed outbound message (text, buttons, or list).
     * @param {string} to  Recipient phone number
     * @param {{ type: 'text'|'buttons'|'list', body: string, buttons?: object[], buttonText?: string, sections?: object[] }} outboundMsg
     * @returns {{ ok: boolean }}
     */
    async sendMessage(to, outboundMsg) {
      const url = `${GRAPH_API_BASE}/${phoneNumberId}/messages`;
      let payload;

      if (outboundMsg.type === 'text') {
        payload = {
          messaging_product: 'whatsapp',
          to,
          type: 'text',
          text: { body: outboundMsg.body },
        };
      } else if (outboundMsg.type === 'buttons') {
        payload = {
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: outboundMsg.body },
            action: {
              buttons: outboundMsg.buttons.map((b) => ({
                type: 'reply',
                reply: { id: b.id, title: b.title },
              })),
            },
          },
        };
      } else if (outboundMsg.type === 'list') {
        payload = {
          messaging_product: 'whatsapp',
          to,
          type: 'interactive',
          interactive: {
            type: 'list',
            body: { text: outboundMsg.body },
            action: {
              button: outboundMsg.buttonText,
              sections: outboundMsg.sections,
            },
          },
        };
      } else {
        console.error(`Unknown outbound message type: ${outboundMsg.type}`);
        return { ok: false };
      }

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.text();
        console.error(`WhatsApp send failed (${res.status}): ${body}`);
        return { ok: false };
      }
      return { ok: true };
    },
  };
}
