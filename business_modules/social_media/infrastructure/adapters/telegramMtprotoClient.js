function normalizeSessionString(raw) {
  let s = String(raw ?? '').trim();
  while (s.startsWith('TELEGRAM_SESSION=')) {
    s = s.slice('TELEGRAM_SESSION='.length).trim();
  }
  return s;
}

/**
 * @param {{ apiId: string|number, apiHash: string, sessionString: string, channelDelayMs?: number }} config
 */
export function assertTelegramConfig({ apiId, apiHash, sessionString }) {
  if (!apiId || !apiHash || !sessionString) {
    throw new Error('TELEGRAM_API_ID, TELEGRAM_API_HASH, and TELEGRAM_SESSION are required');
  }
  if (sessionString[0] !== '1') {
    throw new Error(
      'TELEGRAM_SESSION must be a GramJS string starting with "1" (paste only the value after TELEGRAM_SESSION= in .env)',
    );
  }
}

let gramJsPromise = null;

function loadGramJs() {
  if (!gramJsPromise) {
    gramJsPromise = Promise.all([
      import('telegram'),
      import('telegram/sessions/index.js'),
    ]).then(([telegramMod, sessionsMod]) => ({
      TelegramClient: telegramMod.TelegramClient,
      Api: telegramMod.Api,
      StringSession: sessionsMod.StringSession,
    }));
  }
  return gramJsPromise;
}

function sleep(ms) {
  return new Promise((resolve) => { setTimeout(resolve, ms); });
}

/**
 * @param {object[]} messages
 * @param {number} minTs
 * @param {number} maxTs
 * @param {object[]} collected
 * @returns {boolean} true when history is older than minTs
 */
function ingestHistoryBatch(messages, minTs, maxTs, collected) {
  for (const msg of messages) {
    if (!msg?.message && msg?.className !== 'Message') continue;
    const date = msg.date ?? 0;
    if (date < minTs) return true;
    if (date <= maxTs) {
      collected.push({
        id: msg.id,
        message: msg.message ?? '',
        date: msg.date,
        views: msg.views ?? null,
      });
    }
  }
  return false;
}

/**
 * Minimal MTProto client for public channel history (GramJS).
 *
 * @param {{
 *   apiId: string|number,
 *   apiHash: string,
 *   sessionString: string,
 *   channelDelayMs?: number,
 * }} deps
 */
export function createTelegramMtprotoClient({
  apiId,
  apiHash,
  sessionString,
  channelDelayMs = 1500,
}) {
  assertTelegramConfig({ apiId, apiHash, sessionString });

  const numericApiId = Number(apiId);
  let clientPromise = null;

  async function getClient() {
    if (!clientPromise) {
      clientPromise = (async () => {
        const { TelegramClient, StringSession } = await loadGramJs();
        const client = new TelegramClient(
          new StringSession(sessionString),
          numericApiId,
          apiHash,
          { connectionRetries: 3 },
        );
        await client.connect();
        return client;
      })();
    }
    return clientPromise;
  }

  return {
    async resolveChannel(username) {
      const client = await getClient();
      const clean = String(username ?? '').trim().replace(/^@/, '');
      return client.getEntity(clean);
    },

    /**
     * Fetch channel messages within [minDate, maxDate] (Date objects, inclusive).
     *
     * @param {{ username: string, minDate: Date, maxDate: Date, limit?: number }} opts
     * @returns {Promise<object[]>}
     */
    async getChannelHistory({ username, minDate, maxDate, limit = 100 }) {
      const { Api } = await loadGramJs();
      const client = await getClient();
      const peer = await this.resolveChannel(username);
      const minTs = Math.floor(minDate.getTime() / 1000);
      const maxTs = Math.floor(maxDate.getTime() / 1000);

      /** @type {object[]} */
      const collected = [];
      let offsetId = 0;

      while (collected.length < limit) {
        const batchLimit = Math.min(100, limit - collected.length);
        const result = await client.invoke(new Api.messages.GetHistory({
          peer,
          offsetId,
          offsetDate: maxTs,
          addOffset: 0,
          limit: batchLimit,
          maxId: 0,
          minId: 0,
          hash: BigInt(0),
        }));

        const messages = result?.messages ?? [];
        if (!messages.length) break;

        const reachedOlder = ingestHistoryBatch(messages, minTs, maxTs, collected);
        if (reachedOlder || messages.length < batchLimit) break;
        offsetId = messages[messages.length - 1]?.id ?? 0;
        if (!offsetId) break;
      }

      return collected.slice(0, limit);
    },

    async disconnect() {
      if (!clientPromise) return;
      const client = await clientPromise.catch(() => null);
      clientPromise = null;
      if (client) await client.disconnect();
    },

    channelDelayMs,

    async delayBetweenChannels() {
      await sleep(channelDelayMs);
    },
  };
}

/**
 * @param {{ apiId?: string, apiHash?: string, sessionString?: string, channelDelayMs?: number }} [env]
 */
export function createTelegramMtprotoClientFromEnv(env = process.env) {
  const apiId = env.TELEGRAM_API_ID ?? '';
  const apiHash = env.TELEGRAM_API_HASH ?? '';
  const sessionString = normalizeSessionString(env.TELEGRAM_SESSION ?? '');
  if (!apiId || !apiHash || !sessionString) return null;
  return createTelegramMtprotoClient({ apiId, apiHash, sessionString });
}
