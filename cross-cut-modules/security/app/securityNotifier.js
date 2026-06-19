import { appendAuditEvent } from '../input/auditLog.js';
import { redactSecrets } from '../domain/services/secretRedaction.js';

/** @typedef {'info' | 'warning' | 'critical'} SecurityTier */

const TIER_TO_AUDIT_SEVERITY = {
  info: 'info',
  warning: 'warn',
  critical: 'critical',
};

const TIER_LABEL = {
  info: 'INFO',
  warning: 'WARNING',
  critical: 'CRITICAL',
};

const MAX_TELEGRAM_BODY = 3500;

/**
 * @param {SecurityTier} tier
 * @returns {boolean}
 */
export function shouldNotifyTelegram(tier) {
  return tier === 'warning' || tier === 'critical';
}

/**
 * @param {{ tier: SecurityTier, action: string, summary: string, meta?: object }} payload
 * @returns {string}
 */
export function formatSecurityTelegramMessage({ tier, action, summary, meta }) {
  const label = TIER_LABEL[tier] ?? tier.toUpperCase();
  let body = `[${label}] ${action} — ${summary}`;
  if (meta && Object.keys(meta).length > 0) {
    const metaText = JSON.stringify(redactSecrets(meta), null, 0);
    body += `\n${metaText.slice(0, MAX_TELEGRAM_BODY - body.length - 1)}`;
  }
  return body.slice(0, MAX_TELEGRAM_BODY);
}

/**
 * @param {string} message
 * @param {NodeJS.ProcessEnv} env
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<boolean>}
 */
export async function sendTelegramSecurityAlert(message, env = process.env, fetchImpl = fetch) {
  const token = (env.TELEGRAM_BOT_TOKEN ?? '').trim();
  const chatId = (env.TELEGRAM_SECURITY_CHAT_ID ?? '').trim();
  if (!token || !chatId) {
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: message,
      disable_web_page_preview: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`Telegram sendMessage failed: ${res.status} ${errText.slice(0, 200)}`);
  }

  return true;
}

/**
 * Emit a tiered security event to audit log and optionally Telegram.
 * @param {{
 *   tier: SecurityTier,
 *   action: string,
 *   summary: string,
 *   meta?: object,
 *   resource?: string,
 *   auditLogPath?: string,
 *   env?: NodeJS.ProcessEnv,
 *   fetchImpl?: typeof fetch,
 * }} opts
 * @returns {Promise<{ auditLogged: boolean, telegramSent: boolean }>}
 */
export async function notifySecurityEvent(opts) {
  const {
    tier,
    action,
    summary,
    meta,
    resource,
    auditLogPath,
    env = process.env,
    fetchImpl = fetch,
  } = opts;

  appendAuditEvent(
    {
      severity: TIER_TO_AUDIT_SEVERITY[tier] ?? 'info',
      action,
      resource: resource ?? 'security',
      meta: meta ? { summary, tier, ...meta } : { summary, tier },
    },
    auditLogPath,
  );

  let telegramSent = false;
  if (shouldNotifyTelegram(tier)) {
    try {
      telegramSent = await sendTelegramSecurityAlert(
        formatSecurityTelegramMessage({ tier, action, summary, meta }),
        env,
        fetchImpl,
      );
    } catch (err) {
      appendAuditEvent(
        {
          severity: 'warn',
          action: 'security.notify.telegram_failed',
          resource: resource ?? 'security',
          meta: { summary: String(err?.message ?? err), originalAction: action },
        },
        auditLogPath,
      );
    }
  }

  return { auditLogged: true, telegramSent };
}
