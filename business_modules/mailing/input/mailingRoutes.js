/**
 * Fastify routes for mailing preferences and on-demand digest send.
 */

import { canManageMailingRecipients } from '../../../cross-cut-modules/auth/index.js';
import {
  buildDigestSendList,
  normalizeRecipientEmail,
  DEFAULT_DIGEST_PRODUCTS,
} from '../app/digestRecipients.js';
import { migrateSelfAddressToList } from '../app/migrateSelfAddress.js';

/**
 * Editing the shared list means mailing arbitrary addresses from our domain, so
 * it rides its own allowlist (config/userAccess.json → mailingAdmins) rather
 * than the access ladder — see canManageMailingRecipients.
 */
function canManageRecipients(user) {
  if (!user || user.anonymous) return false;
  return canManageMailingRecipients(user.email);
}

/** @returns {{ to: string } | { error: string }} */
function resolveDigestRecipient({ bodyTo, jwtEmail, savedEmail, anonymous }) {
  if (bodyTo) {
    if (bodyTo !== jwtEmail && bodyTo !== savedEmail) {
      return {
        error: anonymous
          ? 'Recipient must match the saved mailing address'
          : 'Recipient must match your account email or saved mailing address',
      };
    }
    return { to: bodyTo };
  }
  const to = savedEmail || jwtEmail;
  if (!to) {
    return {
      error: 'No destination email — set mailing address in settings or sign in with an email account',
    };
  }
  return { to };
}

/** @returns {number} */
function digestErrorStatus(err) {
  const status = err?.status >= 400 && err?.status < 600 ? err.status : 502;
  return status === 422 ? 502 : status;
}

/**
 * @param {import('fastify').FastifyInstance} app
 * @param {{
 *   prefsStore: ReturnType<import('../infrastructure/mailingPreferencesStore.js').createMailingPreferencesStore>,
 *   mailingService: ReturnType<import('../app/mailingService.js').createMailingService>,
 *   tryAuthPreHandler: (req: any, reply: any) => Promise<void>,
 *   isMailingConfigured: () => boolean,
 *   allowAnonymous?: boolean,
 * }} opts
 */
export async function mailingRoutes(app, opts) {
  const {
    prefsStore,
    mailingService,
    tryAuthPreHandler,
    isMailingConfigured,
    allowAnonymous = false,
  } = opts;

  if (!prefsStore || !tryAuthPreHandler || !isMailingConfigured) {
    throw new Error('mailingRoutes: missing required opts');
  }

  async function requireUserOrAllowedAnonymous(request, reply) {
    await tryAuthPreHandler(request, reply);
    if (!request.user) {
      if (allowAnonymous) {
        request.user = { uid: 'anonymous', email: null, anonymous: true };
        return;
      }
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  }

  const pre = { preHandler: requireUserOrAllowedAnonymous };

  // Stays reachable without a session (the client reads it before sign-in to
  // decide whether to show the "not configured" notice); the user is attached
  // when a token is present so the flag can be computed, but never required.
  app.get('/api/mail/config', { preHandler: tryAuthPreHandler }, async (request, reply) => {
    return reply.send({
      enabled: Boolean(isMailingConfigured?.()),
      canManageRecipients: canManageRecipients(request.user),
    });
  });

  app.get('/api/mail/recipients', pre, async (request, reply) => {
    if (!canManageRecipients(request.user)) {
      return reply.code(403).send({ error: 'Mailing-admin access required' });
    }
    // Admins no longer have a personal destination field, so fold any address
    // left over from before onto the list. Idempotent; a no-op once done.
    migrateSelfAddressToList({ prefsStore, userUid: request.user.uid });
    return reply.send({ recipients: prefsStore.listRecipients() });
  });

  app.post('/api/mail/recipients', pre, async (request, reply) => {
    if (!canManageRecipients(request.user)) {
      return reply.code(403).send({ error: 'Mailing-admin access required' });
    }
    const email = normalizeRecipientEmail(request.body?.email);
    if (!email) {
      return reply.code(400).send({ error: 'Invalid email address' });
    }
    prefsStore.addRecipient({ email, addedByUid: request.user.uid });
    return reply.send({ recipients: prefsStore.listRecipients() });
  });

  app.delete('/api/mail/recipients/:email', pre, async (request, reply) => {
    if (!canManageRecipients(request.user)) {
      return reply.code(403).send({ error: 'Mailing-admin access required' });
    }
    const email = normalizeRecipientEmail(decodeURIComponent(request.params.email ?? ''));
    if (!email) {
      return reply.code(400).send({ error: 'Invalid email address' });
    }
    const removed = prefsStore.removeRecipient(email);
    if (!removed) {
      return reply.code(404).send({ error: 'Recipient not found' });
    }
    return reply.send({ recipients: prefsStore.listRecipients() });
  });

  app.get('/api/mail/preferences', pre, async (request, reply) => {
    const uid = request.user.uid;
    const row = prefsStore.getByUid(uid);
    if (!row) {
      return reply.send({
        email: '',
        language: 'en',
        products: { report: true, naftali: true, education: true, platform: false },
      });
    }
    return reply.send({ email: row.email, language: row.language, products: row.products });
  });

  app.put('/api/mail/preferences', pre, async (request, reply) => {
    const uid = request.user.uid;
    const body = request.body ?? {};
    let emailArg;
    if (Object.hasOwn(body, 'email')) {
      const raw = String(body.email ?? '').trim();
      if (raw !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        return reply.code(400).send({ error: 'Invalid email address' });
      }
      emailArg = raw;
    }
    const products = body.products && typeof body.products === 'object' ? body.products : undefined;
    let languageArg;
    if (Object.hasOwn(body, 'language')) {
      const rawLang = String(body.language ?? '').trim().toLowerCase();
      if (!['en', 'he', 'ru'].includes(rawLang)) {
        return reply.code(400).send({ error: 'Invalid digest language' });
      }
      languageArg = rawLang;
    }

    const saved = prefsStore.upsert({
      userUid: uid,
      email: emailArg,
      language: languageArg,
      products,
    });
    return reply.send({ email: saved.email, language: saved.language, products: saved.products });
  });

  app.post('/api/mail/send-digest', pre, async (request, reply) => {
    if (!isMailingConfigured() || !mailingService) {
      return reply.code(503).send({
        error: 'Mailing is not configured (set RESEND_API_KEY and MAIL_FROM)',
      });
    }

    const uid = request.user.uid;
    const jwtEmail = String(request.user.email ?? '').trim().toLowerCase();
    const body = request.body ?? {};
    const bodyTo = body.to == null ? '' : String(body.to).trim().toLowerCase();
    const prefs = prefsStore.getByUid(uid);
    const savedEmail = String(prefs?.email ?? '').trim().toLowerCase();
    const products = prefs?.products ?? DEFAULT_DIGEST_PRODUCTS;
    const language = prefs?.language ?? 'en';

    // For a mailing admin the shared list is the whole roster — their own
    // address lives on it, so no self entry is synthesized here. An explicit
    // `to` still means "just this one address" (used to re-send to yourself).
    const storedRecipients = !bodyTo && canManageRecipients(request.user)
      ? prefsStore.listRecipients()
      : [];

    let jobs;
    if (storedRecipients.length > 0) {
      jobs = buildDigestSendList({
        recipients: storedRecipients,
        getPrefsByUid: (u) => prefsStore.getByUid(u),
      });
    } else {
      // No list to fan out to (or not an admin): fall back to the caller's own
      // address, which is also what makes "Send now" useful on an empty list.
      const recipient = resolveDigestRecipient({
        bodyTo,
        jwtEmail,
        savedEmail,
        anonymous: request.user.anonymous,
      });
      if (recipient.error) {
        return reply.code(400).send({ error: recipient.error });
      }
      jobs = [{ email: recipient.to, language, products }];
    }

    const results = await Promise.allSettled(jobs.map((job) => mailingService.sendDigest({
      to: job.email,
      products: job.products,
      language: job.language,
    })));

    const failures = results
      .map((r, i) => (r.status === 'rejected' ? { email: jobs[i].email, error: r.reason?.message ?? 'Send failed' } : null))
      .filter(Boolean);

    if (failures.length === jobs.length) {
      const firstReason = results.find((r) => r.status === 'rejected')?.reason;
      return reply.code(digestErrorStatus(firstReason)).send({
        error: failures[0]?.error ?? 'Send failed',
      });
    }

    return reply.send({
      ok: true,
      sent: jobs.length - failures.length,
      total: jobs.length,
      id: results.find((r) => r.status === 'fulfilled')?.value?.id ?? null,
      ...(failures.length > 0 ? { failures } : {}),
    });
  });
}
